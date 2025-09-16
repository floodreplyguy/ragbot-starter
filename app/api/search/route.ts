import { NextResponse } from 'next/server';
import { CHAT_MODEL, EMBEDDING_MODEL, openai } from '@/lib/openai';
import { ASTRA_DB_MISSING_ENV_MESSAGE, getTradeCollection } from '@/lib/astra';
import type { SearchFilters, TradeEntry } from '@/types/trade';
import { buildEmbeddingText } from '@/lib/trade-helpers';

interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  includeAnswer?: boolean;
}

const toTrade = (document: TradeEntry & { $vector?: number[]; document_id?: string }): TradeEntry => {
  const { $vector: _vector, document_id: _docId, ...rest } = document;
  return rest;
};

const buildFilter = (filters?: SearchFilters) => {
  if (!filters) return {};
  const filter: Record<string, unknown> = {};
  if (filters.status) filter.status = filters.status;
  if (filters.tickers?.length) filter.ticker = { $in: filters.tickers.map((ticker) => ticker.toUpperCase()) };
  if (filters.sentiments?.length) filter.sentiment = { $in: filters.sentiments };
  if (filters.from || filters.to) {
    filter.createdAt = {} as Record<string, string>;
    if (filters.from) (filter.createdAt as Record<string, string>).$gte = filters.from;
    if (filters.to) (filter.createdAt as Record<string, string>).$lte = filters.to;
  }
  if (typeof filters.minPnlUsd === 'number' || typeof filters.maxPnlUsd === 'number') {
    filter.pnl_usd = {} as Record<string, number>;
    if (typeof filters.minPnlUsd === 'number') (filter.pnl_usd as Record<string, number>).$gte = filters.minPnlUsd;
    if (typeof filters.maxPnlUsd === 'number') (filter.pnl_usd as Record<string, number>).$lte = filters.maxPnlUsd;
  }
  return filter;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SearchRequest;
    if (!body.query || !body.query.trim()) {
      return NextResponse.json({ error: 'Query text is required.' }, { status: 400 });
    }

    const collection = await getTradeCollection();
    if (!collection) {
      return NextResponse.json(
        { error: ASTRA_DB_MISSING_ENV_MESSAGE },
        { status: 500 },
      );
    }

    const { data } = await openai.embeddings.create({
      input: body.query,
      model: EMBEDDING_MODEL,
    });

    const filter = buildFilter(body.filters);
    const cursor = await collection.find(filter, {
      sort: { $vector: data?.[0]?.embedding },
      limit: body.limit ?? 15,
    });

    const documents = await cursor.toArray();
    const trades = documents.map((doc) => toTrade(doc as TradeEntry));

    let answer: string | null = null;
    if (body.includeAnswer) {
      const context = trades.slice(0, 8).map((trade) => buildEmbeddingText(trade));
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a trading journal analyst. Use the provided trade context to answer the query. '
              + 'If unsure, summarise relevant trades without fabricating data.',
          },
          {
            role: 'user',
            content: `Query: ${body.query}\nTrades:\n${context.join('\n---\n')}`,
          },
        ],
      });
      answer = completion.choices?.[0]?.message?.content ?? null;
    }

    return NextResponse.json({ results: trades, answer });
  } catch (error) {
    console.error('Search failed', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
