import { NextRequest, NextResponse } from 'next/server';
import { CHAT_MODEL, EMBEDDING_MODEL, openai } from '@/lib/openai';
import { ASTRA_DB_MISSING_ENV_MESSAGE, getTradeCollection } from '@/lib/astra';
import {
  TradeAttachment,
  TradeDocument,
  TradeEntry,
  TradeExtraction,
  TradeExtractionSchema,
  TradeType,
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

const embedTrade = async (trade: TradeEntry): Promise<number[] | null> => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  try {
    const { data } = await openai.embeddings.create({
      input: buildEmbeddingText(trade),
      model: EMBEDDING_MODEL,
    });
    return data?.[0]?.embedding ?? null;
  } catch (error) {
    console.error('Failed to generate trade embedding', error);
    return null;
  }
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

const FALLBACK_TICKER_EXCLUSIONS = new Set([
  'LONG',
  'SHORT',
  'CALL',
  'PUT',
  'CALLS',
  'PUTS',
  'OPEN',
  'CLOSE',
  'CLOSED',
  'ENTRY',
  'EXIT',
  'STOP',
  'LOSS',
  'GAIN',
  'TARGET',
  'PNL',
  'USD',
  'SHARES',
  'TRADE',
  'NOTE',
]);

const FALLBACK_UPDATE_HINT =
  /\b(update|add note|still in|holding|trim(?:med|ming)?|scaled|scaling|reduce|adding)\b/i;

const extractNumberFromNote = (note: string, patterns: RegExp[]): number | null => {
  for (const pattern of patterns) {
    const match = note.match(pattern);
    if (match) {
      const rawValue = match[1] ?? match[2];
      if (!rawValue) continue;
      const normalized = rawValue.replace(/[^0-9.-]/g, '');
      if (!normalized) continue;
      const value = Number.parseFloat(normalized);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }
  return null;
};

const extractDurationMinutes = (note: string): number | null => {
  const minuteMatch = note.match(/(\d+(?:\.\d+)?)\s*(?:minutes|min|m)\b/i);
  if (minuteMatch) {
    const value = Number.parseFloat(minuteMatch[1].replace(/[^0-9.]/g, ''));
    if (!Number.isNaN(value)) {
      return Math.round(value);
    }
  }
  const hourMatch = note.match(/(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr|h)\b/i);
  if (hourMatch) {
    const value = Number.parseFloat(hourMatch[1].replace(/[^0-9.]/g, ''));
    if (!Number.isNaN(value)) {
      return Math.round(value * 60);
    }
  }
  return null;
};

const detectTickerFromNote = (note: string): string | undefined => {
  const symbolMatch = note.match(/\$([A-Za-z]{1,5})\b/);
  if (symbolMatch) {
    return symbolMatch[1].toUpperCase();
  }
  const candidates = note.toUpperCase().match(/\b[A-Z]{2,5}\b/g);
  if (!candidates) {
    return undefined;
  }
  for (const candidate of candidates) {
    if (FALLBACK_TICKER_EXCLUSIONS.has(candidate)) continue;
    if (/^\d+$/.test(candidate)) continue;
    return candidate;
  }
  return undefined;
};

const detectTradeTypeFromNote = (note: string): TradeType => {
  if (/\bput(s)?\b/i.test(note)) return 'put';
  if (/\bcall(s)?\b/i.test(note)) return 'call';
  if (/\bshort(ed|ing)?\b/i.test(note)) return 'short';
  return 'long';
};

const detectStatusFromNote = (note: string): 'open' | 'closed' => {
  if (/\b(close|closed|exit|exited|trimmed|stopped|stopped out|took profit|tp|sold)\b/i.test(note)) {
    return 'closed';
  }
  return 'open';
};

const detectSentimentFromNote = (note: string): string | null => {
  const mappings = [
    { regex: /\bbearish\b|\bfearful\b|\banxious\b|\bworried\b|\bnervous\b|\bscared\b/i, value: 'bearish' },
    { regex: /\bbullish\b|\bconfident\b|\boptimistic\b|\bexcited\b|\bpositive\b/i, value: 'bullish' },
    { regex: /\bneutral\b|\bmeh\b|\bindifferent\b/i, value: 'neutral' },
    { regex: /\bfrustrated\b|\bupset\b|\bangry\b|\bannoyed\b|\bdisappointed\b/i, value: 'frustrated' },
    { regex: /\bhappy\b|\bpleased\b|\brelieved\b|\bproud\b/i, value: 'happy' },
  ] as const;
  for (const mapping of mappings) {
    if (mapping.regex.test(note)) {
      return mapping.value;
    }
  }
  return null;
};

const buildFallbackExtraction = (
  note: string,
  tradeId: string | undefined,
  openTrades: TradeEntry[],
): TradeExtraction => {
  const detectedTicker = detectTickerFromNote(note);
  let inferredTradeId = tradeId;
  if (!inferredTradeId && detectedTicker) {
    const matchingOpenTrade = openTrades.find(
      (trade) => trade.ticker === sanitizeTicker(detectedTicker),
    );
    if (matchingOpenTrade && FALLBACK_UPDATE_HINT.test(note)) {
      inferredTradeId = matchingOpenTrade.trade_id;
    }
  }

  const entryPrice = extractNumberFromNote(note, [
    /entry(?: price)?[^0-9-]*(-?\d+(?:\.\d+)?)/i,
    /(?:bought|buy|added|long|call)[^$0-9-]*\$?\s*(-?\d+(?:\.\d+)?)/i,
    /@\s*\$?\s*(-?\d+(?:\.\d+)?)/,
  ]);
  const exitPrice = extractNumberFromNote(note, [
    /exit(?:ed| price)?[^0-9-]*(-?\d+(?:\.\d+)?)/i,
    /(?:sold|close(?:d)?|trim(?:med|ming)?|took profit|tp|target)[^$0-9-]*\$?\s*(-?\d+(?:\.\d+)?)/i,
    /stop(?:ped)?[^$0-9-]*\$?\s*(-?\d+(?:\.\d+)?)/i,
  ]);
  const size = extractNumberFromNote(note, [
    /(\d+(?:\.\d+)?)\s*(?:shares|contracts|lots)/i,
    /size\s*:?\s*(\d+(?:\.\d+)?)/i,
    /qty\s*:?\s*(\d+(?:\.\d+)?)/i,
  ]);
  const pnlUsd = extractNumberFromNote(note, [
    /(?:pnl|profit|gain|loss)[^$0-9-]*\$?\s*(-?\d+(?:\.\d+)?)/i,
    /\$(-?\d+(?:\.\d+)?)[^%a-zA-Z]*\b(?:pnl|gain|loss)/i,
  ]);
  const pnlPct = extractNumberFromNote(note, [/(-?\d+(?:\.\d+)?)\s*%/i]);
  const durationMinutes = extractDurationMinutes(note);
  const rrRatio = extractNumberFromNote(note, [
    /(\d+(?:\.\d+)?)\s*R\b/i,
    /R\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  ]);

  const summary = note.trim().slice(0, 280) || null;

  return {
    action: inferredTradeId ? 'update' : 'create',
    target_trade_id: inferredTradeId,
    trade: {
      trade_id: inferredTradeId,
      ticker: detectedTicker,
      trade_type: detectTradeTypeFromNote(note),
      size: size ?? null,
      entry_price: entryPrice ?? null,
      exit_price: exitPrice ?? null,
      pnl_pct: pnlPct ?? null,
      pnl_usd: pnlUsd ?? null,
      duration_minutes: durationMinutes ?? null,
      rr_ratio: rrRatio ?? null,
      sentiment: detectSentimentFromNote(note),
      status: detectStatusFromNote(note),
      raw_summary: summary,
    },
    reasoning:
      'Fallback heuristics were applied because the AI trade extraction service was unavailable.',
  };
};

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status');
    const ticker = searchParams.get('ticker');
    const sentiment = searchParams.get('sentiment');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Number(searchParams.get('limit') ?? '200');

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

export async function POST(req: NextRequest) {
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

    const resolvedTradeId = tradeId?.trim() ? tradeId.trim() : undefined;

    let extraction: TradeExtraction | null = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const llmPayload = {
          note,
          forcedTargetId: resolvedTradeId ?? null,
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
        extraction = TradeExtractionSchema.parse(JSON.parse(rawContent));
      } catch (error) {
        console.error('LLM trade extraction failed, using heuristic fallback', error);
      }
    }

    if (!extraction) {
      extraction = TradeExtractionSchema.parse(
        buildFallbackExtraction(note, resolvedTradeId, openTrades),
      );
    }

    const now = new Date().toISOString();
    const action = resolvedTradeId ? 'update' : extraction.action;
    const targetTradeId =
      resolvedTradeId ?? extraction.target_trade_id ?? extraction.trade.trade_id ?? null;

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
      const vectorFields = embedding ? { $vector: embedding } : {};
      await collection.updateOne(
        { document_id: targetTradeId },
        {
          $set: {
            ...updatedTrade,
            ...vectorFields,
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
    const vectorFields = embedding ? { $vector: embedding } : {};

    await collection.insertOne({
      document_id: trade_id,
      ...newTrade,
      ...vectorFields,
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
