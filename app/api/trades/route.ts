import { NextResponse } from 'next/server';
import { CHAT_MODEL, EMBEDDING_MODEL, openai } from '@/lib/openai';
import { ASTRA_DB_MISSING_ENV_MESSAGE, getTradeCollection } from '@/lib/astra';
import {
  TradeAttachment,
  TradeDocument,
  TradeEntry,
  TradeExtractionSchema,
} from '@/types/trade';
import {
  buildEmbeddingText,
  createNote,
  mergeAttachments,
  mergeNotes,
  normalizeAttachments,
  sanitizeStatus,
  sanitizeTicker,
  sanitizeTradeType,
} from '@/lib/trade-helpers';

type TradeDocumentRecord = TradeDocument & { document_id?: string; $vector?: number[] };

const toTradeEntry = (document: TradeDocumentRecord): TradeEntry => {
  const { $vector: _vector, document_id: _docId, ...rest } = document;
  return rest;
};

const embedTrade = async (trade: TradeEntry) => {
  const { data } = await openai.embeddings.create({
    input: buildEmbeddingText(trade),
    model: EMBEDDING_MODEL,
  });
  return data?.[0]?.embedding;
};

const collectOpenTradeContext = (trades: TradeEntry[]) =>
  trades.map((trade) => ({
    trade_id: trade.trade_id,
    ticker: trade.ticker,
    trade_type: trade.trade_type,
    entry_price: trade.entry_price,
    opened_at: trade.opened_at,
    sentiment: trade.sentiment,
    latest_note: trade.notes.at(-1)?.text ?? '',
  }));

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const ticker = url.searchParams.get('ticker');
    const sentiment = url.searchParams.get('sentiment');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = Number(url.searchParams.get('limit') ?? '200');

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (ticker) filter.ticker = ticker.toUpperCase();
    if (sentiment) filter.sentiment = sentiment;
    if (from || to) {
      filter.createdAt = {} as Record<string, string>;
      if (from) (filter.createdAt as Record<string, string>).$gte = from;
      if (to) (filter.createdAt as Record<string, string>).$lte = to;
    }

    const collection = await getTradeCollection();
    if (!collection) {
      return NextResponse.json(
        { error: ASTRA_DB_MISSING_ENV_MESSAGE },
        { status: 500 },
      );
    }
    const cursor = await collection.find(filter, {
      limit: Number.isNaN(limit) ? 200 : limit,
      sort: { createdAt: -1 },
    });

    const documents = (await cursor.toArray()) as TradeDocumentRecord[];
    const trades = documents.map(toTradeEntry);

    return NextResponse.json({ trades });
  } catch (error) {
    console.error('Failed to fetch trades', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}

interface TradeRequestBody {
  note: string;
  attachments?: TradeAttachment[];
  tradeId?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TradeRequestBody;
    const { note, attachments = [], tradeId } = body;

    if (!note || !note.trim()) {
      return NextResponse.json({ error: 'A journal note is required.' }, { status: 400 });
    }

    const sanitizedAttachments = normalizeAttachments(attachments);
    const collection = await getTradeCollection();
    if (!collection) {
      return NextResponse.json(
        { error: ASTRA_DB_MISSING_ENV_MESSAGE },
        { status: 500 },
      );
    }

    const openTradesCursor = await collection.find({ status: 'open' }, { limit: 12 });
    const openTradeDocuments = (await openTradesCursor.toArray()) as TradeDocumentRecord[];
    const openTrades = openTradeDocuments.map(toTradeEntry);

    const llmPayload = {
      note,
      forcedTargetId: tradeId ?? null,
      openTrades: collectOpenTradeContext(openTrades),
      instructions:
        'Analyse the note, decide whether to create a new trade or update an existing open trade. '
        + 'If the user supplied forcedTargetId use it for the update. '
        + 'Always populate missing numeric fields with null. Use minutes for duration_minutes.',
    };

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant that extracts structured trade journal data. '
            + 'Return JSON with shape {"action":"create|update","target_trade_id":string|null,'
            + '"trade":{trade_id?,ticker,trade_type,size,entry_price,exit_price,pnl_pct,pnl_usd,'
            + 'duration_minutes,rr_ratio,sentiment,status,opened_at,closed_at,raw_summary},'
            + '"reasoning":string}. Use null for missing fields.',
        },
        {
          role: 'user',
          content: JSON.stringify(llmPayload),
        },
      ],
    });

    const rawContent = completion.choices?.[0]?.message?.content ?? '{}';
    const extraction = TradeExtractionSchema.parse(JSON.parse(rawContent));

    const now = new Date().toISOString();
    const action = tradeId ? 'update' : extraction.action;
    const targetTradeId = tradeId ?? extraction.target_trade_id ?? extraction.trade.trade_id ?? null;

    if (action === 'update') {
      if (!targetTradeId) {
        return NextResponse.json({ error: 'Unable to identify trade to update.' }, { status: 400 });
      }

      const existing = (await collection.findOne({ document_id: targetTradeId })) as
        | TradeDocumentRecord
        | null;
      if (!existing) {
        return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
      }

      const existingEntry = toTradeEntry(existing);
      const mergedNotes = mergeNotes(existingEntry.notes, [createNote(note)]);
      const mergedAttachments = mergeAttachments(existingEntry.attachments, sanitizedAttachments);

      const updatedStatus = sanitizeStatus(extraction.trade.status ?? existingEntry.status);
      const updatedTrade: TradeEntry = {
        ...existingEntry,
        ticker: sanitizeTicker(extraction.trade.ticker ?? existingEntry.ticker),
        trade_type: sanitizeTradeType(extraction.trade.trade_type ?? existingEntry.trade_type),
        size: extraction.trade.size ?? existingEntry.size ?? null,
        entry_price: extraction.trade.entry_price ?? existingEntry.entry_price ?? null,
        exit_price: extraction.trade.exit_price ?? existingEntry.exit_price ?? null,
        pnl_pct: extraction.trade.pnl_pct ?? existingEntry.pnl_pct ?? null,
        pnl_usd: extraction.trade.pnl_usd ?? existingEntry.pnl_usd ?? null,
        duration_minutes:
          extraction.trade.duration_minutes ?? existingEntry.duration_minutes ?? null,
        rr_ratio: extraction.trade.rr_ratio ?? existingEntry.rr_ratio ?? null,
        sentiment: extraction.trade.sentiment ?? existingEntry.sentiment ?? null,
        status: updatedStatus,
        notes: mergedNotes,
        attachments: mergedAttachments,
        opened_at: extraction.trade.opened_at ?? existingEntry.opened_at ?? now,
        closed_at:
          updatedStatus === 'closed'
            ? extraction.trade.closed_at ?? existingEntry.closed_at ?? now
            : null,
        raw_summary: extraction.trade.raw_summary ?? existingEntry.raw_summary ?? null,
        updatedAt: now,
        createdAt: existingEntry.createdAt,
      };

      const embedding = await embedTrade(updatedTrade);
      await collection.updateOne(
        { document_id: targetTradeId },
        {
          $set: {
            ...updatedTrade,
            $vector: embedding,
          },
        },
      );

      return NextResponse.json({
        action: 'update',
        trade: updatedTrade,
        reasoning: extraction.reasoning,
      });
    }

    const trade_id = extraction.trade.trade_id ?? crypto.randomUUID();
    const status = sanitizeStatus(
      extraction.trade.status ?? (extraction.trade.exit_price != null ? 'closed' : 'open'),
    );

    const newTrade: TradeEntry = {
      trade_id,
      ticker: sanitizeTicker(extraction.trade.ticker),
      trade_type: sanitizeTradeType(extraction.trade.trade_type),
      size: extraction.trade.size ?? null,
      entry_price: extraction.trade.entry_price ?? null,
      exit_price: extraction.trade.exit_price ?? null,
      pnl_pct: extraction.trade.pnl_pct ?? null,
      pnl_usd: extraction.trade.pnl_usd ?? null,
      duration_minutes: extraction.trade.duration_minutes ?? null,
      rr_ratio: extraction.trade.rr_ratio ?? null,
      sentiment: extraction.trade.sentiment ?? null,
      status,
      notes: [createNote(note)],
      attachments: sanitizedAttachments,
      opened_at: extraction.trade.opened_at ?? now,
      closed_at: status === 'closed' ? extraction.trade.closed_at ?? now : null,
      raw_summary: extraction.trade.raw_summary ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const embedding = await embedTrade(newTrade);

    await collection.insertOne({
      document_id: trade_id,
      ...newTrade,
      $vector: embedding,
    });

    return NextResponse.json({
      action: 'create',
      trade: newTrade,
      reasoning: extraction.reasoning,
    });
  } catch (error) {
    console.error('Failed to process journal entry', error);
    return NextResponse.json(
      { error: 'Failed to process journal entry. Check server logs for details.' },
      { status: 500 },
    );
  }
}
