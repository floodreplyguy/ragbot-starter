import { tradeTypes, TradeAttachment, TradeEntry, TradeNote, TradeStatus, TradeType } from '../types/trade';

export const sanitizeTicker = (value?: string | null) =>
  value ? value.trim().toUpperCase() : 'UNKNOWN';

export const sanitizeTradeType = (value?: string | null): TradeType => {
  if (!value) return 'long';
  const lower = value.toLowerCase();
  return (tradeTypes.find((type) => type === lower) ?? 'long') as TradeType;
};

export const sanitizeStatus = (value?: string | null): TradeStatus => {
  if (!value) return 'open';
  const lower = value.toLowerCase();
  return lower === 'closed' ? 'closed' : 'open';
};

export const coerceNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const createNote = (text: string): TradeNote => ({
  id: crypto.randomUUID(),
  text,
  createdAt: new Date().toISOString(),
});

export const normalizeAttachments = (attachments?: TradeAttachment[]) =>
  (attachments ?? []).map((attachment) => ({
    ...attachment,
    id: attachment.id ?? crypto.randomUUID(),
  }));

export const buildEmbeddingText = (trade: TradeEntry) => {
  const metricLines = [
    `Ticker: ${trade.ticker}`,
    `Type: ${trade.trade_type}`,
    `Status: ${trade.status}`,
    `Size: ${trade.size ?? 'n/a'}`,
    `Entry: ${trade.entry_price ?? 'n/a'}`,
    `Exit: ${trade.exit_price ?? 'n/a'}`,
    `PnL USD: ${trade.pnl_usd ?? 'n/a'}`,
    `PnL %: ${trade.pnl_pct ?? 'n/a'}`,
    `R:R: ${trade.rr_ratio ?? 'n/a'}`,
    `Sentiment: ${trade.sentiment ?? 'n/a'}`,
  ];
  const noteBlock = trade.notes.map((note) => `Note @${note.createdAt}: ${note.text}`).join('\n');
  const summary = trade.raw_summary ? `Summary: ${trade.raw_summary}` : '';
  return [...metricLines, summary, noteBlock].filter(Boolean).join('\n');
};

export const mergeNotes = (existing: TradeNote[], incoming?: TradeNote[]) => {
  if (!incoming || !incoming.length) return existing;
  const existingIds = new Set(existing.map((note) => note.id));
  const merged = [...existing];
  incoming.forEach((note) => {
    if (!existingIds.has(note.id)) {
      merged.push(note);
      existingIds.add(note.id);
    }
  });
  return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

export const mergeAttachments = (
  existing: TradeAttachment[],
  incoming?: TradeAttachment[],
) => {
  if (!incoming || !incoming.length) return existing;
  const map = new Map(existing.map((attachment) => [attachment.id, attachment] as const));
  incoming.forEach((attachment) => {
    map.set(attachment.id, attachment);
  });
  return Array.from(map.values());
};
