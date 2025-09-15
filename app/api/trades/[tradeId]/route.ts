import { NextResponse } from 'next/server';
import { Params } from 'next/dist/shared/lib/router/utils/route-matcher';
import { getTradeCollection } from '@/lib/astra';
import { CHAT_MODEL, EMBEDDING_MODEL, openai } from '@/lib/openai';
import type { TradeAttachment, TradeEntry } from '@/types/trade';
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

const toTradeEntry = (document: TradeEntry & { $vector?: number[]; document_id?: string }): TradeEntry => {
  const { $vector: _vector, document_id: _docId, ...rest } = document;
  return rest;
};

const embed = async (trade: TradeEntry) => {
  const { data } = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: buildEmbeddingText(trade),
  });
  return data?.[0]?.embedding;
};

export async function GET(_req: Request, context: { params: Params }) {
  try {
    const collection = await getTradeCollection();
    const document = await collection.findOne({ document_id: context.params.tradeId });

    if (!document) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ trade: toTradeEntry(document as TradeEntry) });
  } catch (error) {
    console.error('Failed to fetch trade', error);
    return NextResponse.json({ error: 'Failed to fetch trade' }, { status: 500 });
  }
}

interface UpdateBody {
  trade: Partial<TradeEntry>;
  note?: string;
  attachments?: TradeAttachment[];
  removeAttachmentIds?: string[];
  reanalyze?: boolean;
}

export async function PUT(req: Request, context: { params: Params }) {
  try {
    const body = (await req.json()) as UpdateBody;
    const {
      trade: tradeUpdate,
      note,
      attachments,
      removeAttachmentIds = [],
      reanalyze,
    } = body;

    const collection = await getTradeCollection();
    const existingDocument = await collection.findOne({ document_id: context.params.tradeId });

    if (!existingDocument) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const existing = toTradeEntry(existingDocument as TradeEntry);
    const now = new Date().toISOString();

    const cleanedAttachments = normalizeAttachments(attachments);
    const keptAttachments = existing.attachments.filter(
      (attachment) => !removeAttachmentIds.includes(attachment.id),
    );
    const mergedAttachments = mergeAttachments(keptAttachments, cleanedAttachments);

    const updatedStatus = tradeUpdate.status
      ? sanitizeStatus(tradeUpdate.status)
      : sanitizeStatus(existing.status);

    const appendedNotes = note ? mergeNotes(existing.notes, [createNote(note)]) : existing.notes;

    const { notes: _notes, attachments: _incomingAttachments, ...restUpdate } = tradeUpdate;

    const updatedTrade: TradeEntry = {
      ...existing,
      ...restUpdate,
      trade_id: existing.trade_id,
      ticker: sanitizeTicker(tradeUpdate.ticker ?? existing.ticker),
      trade_type: sanitizeTradeType(tradeUpdate.trade_type ?? existing.trade_type),
      status: updatedStatus,
      attachments: mergedAttachments,
      notes: appendedNotes,
      opened_at: tradeUpdate.opened_at ?? existing.opened_at,
      closed_at:
        updatedStatus === 'closed'
          ? tradeUpdate.closed_at ?? existing.closed_at ?? now
          : tradeUpdate.closed_at ?? null,
      updatedAt: now,
      createdAt: existing.createdAt,
    };

    if (reanalyze && note) {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are refining an existing trade entry. Return JSON with shape {"updates":{size?,entry_price?,exit_price?,pnl_pct?,pnl_usd?,duration_minutes?,rr_ratio?,sentiment?,raw_summary?}}',
          },
          {
            role: 'user',
            content: JSON.stringify({
              note,
              current: {
                ticker: existing.ticker,
                trade_type: existing.trade_type,
                entry_price: existing.entry_price,
                exit_price: existing.exit_price,
                pnl_pct: existing.pnl_pct,
                pnl_usd: existing.pnl_usd,
                duration_minutes: existing.duration_minutes,
                rr_ratio: existing.rr_ratio,
                sentiment: existing.sentiment,
              },
            }),
          },
        ],
      });

      try {
        const updates = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
        if (updates?.updates) {
          Object.assign(updatedTrade, updates.updates);
        }
      } catch (error) {
        console.warn('Failed to parse reanalysis updates', error);
      }
    }

    const embedding = await embed(updatedTrade);

    await collection.updateOne(
      { document_id: context.params.tradeId },
      {
        $set: {
          ...updatedTrade,
          $vector: embedding,
        },
      },
    );

    return NextResponse.json({ trade: updatedTrade });
  } catch (error) {
    console.error('Failed to update trade', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: Params }) {
  try {
    const collection = await getTradeCollection();
    await collection.deleteOne({ document_id: context.params.tradeId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete trade', error);
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 });
  }
}
