import { NextResponse } from 'next/server';
import { CHAT_MODEL, EMBEDDING_MODEL, openai } from '@/lib/openai';
import { getTradeCollection } from '@/lib/astra';
import type { SearchFilters, TradeEntry } from '@/types/trade';
import { buildEmbeddingText } from '@/lib/trade-helpers';
import {
  buildSearchAnswer as buildMemorySearchAnswer,
  searchTrades as searchMemoryTrades,
} from '@/lib/memory-trade-store';

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

    const limit = body.limit ?? 15;
    const collection = await getTradeCollection();
    const filter = buildFilter(body.filters);

    if (!collection || !process.env.OPENAI_API_KEY) {
      const results = searchMemoryTrades(body.query, filter, limit);
      const answer = body.includeAnswer
        ? buildMemorySearchAnswer(body.query, results)
        : null;
      return NextResponse.json({ results, ...(answer ? { answer } : {}) });
    }

    let embedding;
    try {
      const { data } = await openai.embeddings.create({
        input: body.query,
        model: EMBEDDING_MODEL,
      });
      embedding = data?.[0]?.embedding;
    } catch (error) {
      console.error('Search embedding failed, using heuristic fallback', error);
      const results = searchMemoryTrades(body.query, filter, limit);
      const answer = body.includeAnswer
        ? buildMemorySearchAnswer(body.query, results)
        : null;
      return NextResponse.json({ results, ...(answer ? { answer } : {}) });
    }

    const cursor = await collection.find(filter, {
      sort: { $vector: embedding },
      limit,
    });

    const documents = await cursor.toArray();
    const trades = documents.map((doc) => toTrade(doc as TradeEntry));

    let answer: string | null = null;
    if (body.includeAnswer) {
      try {
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
      } catch (error) {
        console.error('Search answer generation failed, falling back to heuristic summary', error);
        answer = buildMemorySearchAnswer(body.query, trades);
      }
    }

    return NextResponse.json({ results: trades, ...(answer ? { answer } : {}) });
  } catch (error) {
    console.error('Search failed', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
