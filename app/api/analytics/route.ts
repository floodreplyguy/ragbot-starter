import { NextResponse } from 'next/server';
import { ASTRA_DB_MISSING_ENV_MESSAGE, getTradeCollection } from '@/lib/astra';
import { calculateAnalytics } from '@/lib/analytics';
import type { TradeEntry } from '@/types/trade';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = Number(url.searchParams.get('limit') ?? '500');

    const filter: Record<string, unknown> = {};
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
      limit: Number.isNaN(limit) ? 500 : limit,
      sort: { createdAt: -1 },
    });
    const documents = await cursor.toArray();

    const trades = documents.map((document) => {
      const { $vector: _vector, document_id: _docId, ...rest } = document as TradeEntry & {
        $vector?: number[];
        document_id?: string;
      };
      return rest as TradeEntry;
    });

    const analytics = calculateAnalytics(trades);
    return NextResponse.json({ analytics, count: trades.length });
  } catch (error) {
    console.error('Failed to compute analytics', error);
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}
