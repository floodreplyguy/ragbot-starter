import fs from 'fs';
import path from 'path';
import type { SearchFilters, TradeEntry } from '@/types/trade';
import { buildEmbeddingText } from '@/lib/trade-helpers';

interface ListOptions {
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt';
  direction?: 'asc' | 'desc';
}

type FilterRecord = Record<string, unknown>;

type MemoryStore = {
  trades: TradeEntry[];
};

const STORE_SYMBOL = Symbol.for('neon.trade.memoryStore');

const getStore = (): MemoryStore => {
  const globalWithStore = globalThis as typeof globalThis & {
    [STORE_SYMBOL]?: MemoryStore;
  };

  if (!globalWithStore[STORE_SYMBOL]) {
    globalWithStore[STORE_SYMBOL] = {
      trades: loadInitialTrades(),
    };
  }

  return globalWithStore[STORE_SYMBOL]!;
};

const loadInitialTrades = (): TradeEntry[] => {
  try {
    const filePath = path.resolve(process.cwd(), 'scripts/sample_trades.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as TradeEntry[];
    return parsed.map(cloneTrade);
  } catch (error) {
    console.warn('Memory trade store initialisation failed', error);
    return [];
  }
};

const cloneTrade = (trade: TradeEntry): TradeEntry => JSON.parse(JSON.stringify(trade));

const toComparable = (value: unknown): number | string | null => {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) {
      return asDate;
    }
    return value.toLowerCase();
  }
  return null;
};

const compareWithOperator = (
  tradeValue: unknown,
  target: unknown,
  operator: '$gte' | '$lte',
): boolean => {
  const left = toComparable(tradeValue);
  const right = toComparable(target);
  if (left == null || right == null) return false;
  if (typeof left === 'number' && typeof right === 'number') {
    return operator === '$gte' ? left >= right : left <= right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return operator === '$gte' ? left >= right : left <= right;
  }
  return false;
};

const matchesFilter = (trade: TradeEntry, filter: FilterRecord): boolean => {
  return Object.entries(filter).every(([key, condition]) => {
    if (condition == null) return true;
    const value = (trade as Record<string, unknown>)[key];

    if (typeof condition === 'object' && !Array.isArray(condition)) {
      const conditionRecord = condition as Record<string, unknown>;
      if ('$in' in conditionRecord) {
        const set = conditionRecord.$in as unknown[] | undefined;
        if (!set?.length) return true;
        return set.some((candidate) => {
          if (typeof candidate === 'string' && typeof value === 'string') {
            return candidate.toLowerCase() === value.toLowerCase();
          }
          return candidate === value;
        });
      }
      let passes = true;
      if ('$gte' in conditionRecord) {
        passes = passes && compareWithOperator(value, conditionRecord.$gte, '$gte');
      }
      if ('$lte' in conditionRecord) {
        passes = passes && compareWithOperator(value, conditionRecord.$lte, '$lte');
      }
      return passes;
    }

    if (typeof condition === 'string' && typeof value === 'string') {
      return condition.toLowerCase() === value.toLowerCase();
    }

    return value === condition;
  });
};

const sortTrades = (
  trades: TradeEntry[],
  { sortBy = 'createdAt', direction = 'desc' }: ListOptions,
): TradeEntry[] => {
  const key = sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt';
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...trades].sort((a, b) => {
    const left = toComparable((a as Record<string, unknown>)[key]) ?? 0;
    const right = toComparable((b as Record<string, unknown>)[key]) ?? 0;
    if (left === right) return 0;
    return left > right ? multiplier : -multiplier;
  });
};

export const listTrades = (
  filter: FilterRecord = {},
  options: ListOptions = {},
): TradeEntry[] => {
  const store = getStore();
  const filtered = store.trades.filter((trade) => matchesFilter(trade, filter));
  const sorted = sortTrades(filtered, options);
  const limited = options.limit ? sorted.slice(0, options.limit) : sorted;
  return limited.map(cloneTrade);
};

export const getTradeById = (tradeId: string): TradeEntry | null => {
  const store = getStore();
  const match = store.trades.find((trade) => trade.trade_id === tradeId);
  return match ? cloneTrade(match) : null;
};

export const upsertTrade = (trade: TradeEntry): TradeEntry => {
  const store = getStore();
  const copy = cloneTrade(trade);
  store.trades = [copy, ...store.trades.filter((existing) => existing.trade_id !== copy.trade_id)];
  return copy;
};

export const deleteTrade = (tradeId: string): boolean => {
  const store = getStore();
  const initialLength = store.trades.length;
  store.trades = store.trades.filter((trade) => trade.trade_id !== tradeId);
  return store.trades.length < initialLength;
};

const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSearchTokens = (query: string): string[] => {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
};

const buildSearchCorpus = (trade: TradeEntry): string => {
  const noteText = trade.notes.map((note) => note.text).join(' ');
  const summary = trade.raw_summary ?? '';
  const metadata = `${trade.ticker} ${trade.trade_type} ${trade.status} ${trade.sentiment ?? ''}`;
  return `${metadata}\n${noteText}\n${summary}\n${buildEmbeddingText(trade)}`.toLowerCase();
};

const rankTradesByTokens = (trades: TradeEntry[], tokens: string[]): Array<{ trade: TradeEntry; score: number }> => {
  return trades.map((trade) => {
    if (tokens.length === 0) {
      return { trade, score: 0 };
    }
    const corpus = buildSearchCorpus(trade);
    const ticker = trade.ticker.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (!token) continue;
      if (ticker === token) {
        score += 3;
      }
      if (corpus.includes(token)) {
        const regex = new RegExp(escapeForRegex(token), 'g');
        const matches = corpus.match(regex);
        score += matches ? matches.length : 1;
      }
    }
    return { trade, score };
  });
};

const sortByScore = (ranked: Array<{ trade: TradeEntry; score: number }>): TradeEntry[] => {
  return ranked
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const aTime = toComparable(a.trade.updatedAt) ?? 0;
      const bTime = toComparable(b.trade.updatedAt) ?? 0;
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    })
    .map(({ trade }) => cloneTrade(trade));
};

export const searchTrades = (
  query: string,
  filter: FilterRecord = {},
  limit = 15,
): TradeEntry[] => {
  const tokens = buildSearchTokens(query);
  const candidates = listTrades(filter, { sortBy: 'updatedAt', direction: 'desc' });
  const ranked = sortByScore(rankTradesByTokens(candidates, tokens));
  return ranked.slice(0, limit);
};

const formatPnl = (trade: TradeEntry): string => {
  if (typeof trade.pnl_usd === 'number') {
    const value = trade.pnl_usd.toFixed(2);
    return `${trade.pnl_usd >= 0 ? 'up' : 'down'} $${Math.abs(trade.pnl_usd).toFixed(2)}`;
  }
  if (typeof trade.pnl_pct === 'number') {
    return `${trade.pnl_pct >= 0 ? 'up' : 'down'} ${Math.abs(trade.pnl_pct).toFixed(2)}%`;
  }
  return 'no recorded PnL';
};

export const buildSearchAnswer = (query: string, trades: TradeEntry[]): string => {
  if (!trades.length) {
    return `I couldn't find any journal entries related to "${query}". Try adjusting your filters or add more detail to future notes.`;
  }
  const header =
    trades.length === 1
      ? `I found one trade related to "${query}".`
      : `I found ${trades.length} trades related to "${query}".`;
  const bulletPoints = trades.slice(0, 3).map((trade) => {
    const latestNote = trade.notes.at(-1)?.text ?? 'No journal notes recorded yet.';
    return `• ${trade.ticker} ${trade.trade_type} (${trade.status}) — ${formatPnl(trade)}. ${latestNote}`;
  });
  return [header, ...bulletPoints].join('\n');
};

export const getRelevantTrades = (query: string, limit = 6): TradeEntry[] => {
  const tokens = buildSearchTokens(query);
  const ranked = sortByScore(rankTradesByTokens(listTrades({}, { sortBy: 'updatedAt', direction: 'desc' }), tokens));
  return ranked.slice(0, limit);
};

export const buildFilterFromSearchFilters = (filters?: SearchFilters): FilterRecord => {
  if (!filters) return {};
  const filter: FilterRecord = {};
  if (filters.status) filter.status = filters.status;
  if (filters.tickers?.length) {
    filter.ticker = { $in: filters.tickers.map((ticker) => ticker.toUpperCase()) };
  }
  if (filters.sentiments?.length) {
    filter.sentiment = { $in: filters.sentiments };
  }
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

export const resetMemoryStore = () => {
  const store = getStore();
  store.trades = loadInitialTrades();
};

export const isMemoryStoreActive = (): boolean => {
  const missing = [
    process.env.ASTRA_DB_APPLICATION_TOKEN,
    process.env.ASTRA_DB_API_ENDPOINT,
    process.env.ASTRA_DB_NAMESPACE,
  ];
  return missing.some((value) => !value);
};
