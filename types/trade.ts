import { z } from 'zod';

export const tradeTypes = ['long', 'short', 'call', 'put'] as const;
export type TradeType = typeof tradeTypes[number];

export const tradeStatuses = ['open', 'closed'] as const;
export type TradeStatus = typeof tradeStatuses[number];

export interface TradeAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
}

export interface TradeNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface TradeEntry {
  trade_id: string;
  ticker: string;
  trade_type: TradeType;
  size?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  pnl_pct?: number | null;
  pnl_usd?: number | null;
  duration_minutes?: number | null;
  rr_ratio?: number | null;
  sentiment?: string | null;
  status: TradeStatus;
  notes: TradeNote[];
  attachments: TradeAttachment[];
  opened_at?: string | null;
  closed_at?: string | null;
  raw_summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeDocument extends TradeEntry {
  $vector?: number[];
}

export interface TradeAnalytics {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  averageRR: number | null;
  averageHoldMinutes: number | null;
  longestWinStreak: number;
  currentWinStreak: number;
  bestTrade: TradeEntry | null;
  worstTrade: TradeEntry | null;
  performanceByTicker: Array<{
    ticker: string;
    trades: number;
    totalPnlUsd: number;
    winRate: number;
  }>;
  sentimentPerformance: Array<{
    sentiment: string;
    averagePnlUsd: number;
    winRate: number;
    trades: number;
  }>;
  pnlTimeline: Array<{
    date: string;
    cumulativePnlUsd: number;
    trade_id: string;
    label: string;
  }>;
}

export const TradeExtractionSchema = z.object({
  action: z.enum(['create', 'update']),
  target_trade_id: z.string().optional(),
  trade: z.object({
    trade_id: z.string().optional(),
    ticker: z.string().optional(),
    trade_type: z.enum(tradeTypes).optional(),
    size: z.coerce.number().nullable().optional(),
    entry_price: z.coerce.number().nullable().optional(),
    exit_price: z.coerce.number().nullable().optional(),
    pnl_pct: z.coerce.number().nullable().optional(),
    pnl_usd: z.coerce.number().nullable().optional(),
    duration_minutes: z.coerce.number().nullable().optional(),
    rr_ratio: z.coerce.number().nullable().optional(),
    sentiment: z.string().nullable().optional(),
    status: z.enum(tradeStatuses).optional(),
    opened_at: z.string().nullable().optional(),
    closed_at: z.string().nullable().optional(),
    raw_summary: z.string().nullable().optional(),
  }),
  reasoning: z.string().optional(),
}).strict();

export type TradeExtraction = z.infer<typeof TradeExtractionSchema>;

export interface SearchFilters {
  status?: TradeStatus;
  tickers?: string[];
  sentiments?: string[];
  from?: string;
  to?: string;
  minPnlUsd?: number;
  maxPnlUsd?: number;
}
