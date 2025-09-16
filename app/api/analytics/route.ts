import { NextRequest, NextResponse } from 'next/server';
import { getTradeCollection } from '@/lib/astra';
import { calculateAnalytics } from '@/lib/analytics';
import type { TradeEntry } from '@/types/trade';
import { listTrades as listMemoryTrades } from '@/lib/memory-trade-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Number(searchParams.get('limit') ?? '500');

    const filter: Record<string, unknown> = {};
    if (from || to) {
      filter.createdAt = {} as Record<string, string>;
      if (from) (filter.createdAt as Record<string, string>).$gte = from;
      if (to) (filter.createdAt as Record<string, string>).$lte = to;
    }

    const collection = await getTradeCollection();
    let trades: TradeEntry[] = [];
    if (collection) {
      const cursor = await collection.find(filter, {
        limit: Number.isNaN(limit) ? 500 : limit,
        sort: { createdAt: -1 },
      });
      const documents = await cursor.toArray();

      trades = documents.map((document) => {
        const { $vector: _vector, document_id: _docId, ...rest } = document as TradeEntry & {
          $vector?: number[];
          document_id?: string;
        };
        return rest as TradeEntry;
      });
    } else {
      trades = listMemoryTrades(filter, {
        limit: Number.isNaN(limit) ? 500 : limit,
        sortBy: 'createdAt',
        direction: 'desc',
      });
    }

    const analytics = calculateAnalytics(trades);
    return NextResponse.json({ analytics, count: trades.length });
  } catch (error) {
    console.error('Failed to compute analytics', error);
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}
