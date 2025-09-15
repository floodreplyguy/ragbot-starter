'use client';

import clsx from 'clsx';
import type { TradeEntry } from '@/types/trade';
import { formatDateTime } from '@/lib/format';

interface TradeNavigatorProps {
  trades: TradeEntry[];
  selectedId?: string;
  onSelect: (trade: TradeEntry, index: number) => void;
  title?: string;
}

export default function TradeNavigator({ trades, selectedId, onSelect, title }: TradeNavigatorProps) {
  if (!trades.length) {
    return (
      <div className="retro-panel p-4 text-sm text-muted">
        <p>No trades available yet. Journal a trade to start your collection.</p>
      </div>
    );
  }

  return (
    <div className="retro-panel max-h-[380px] overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.35em] text-muted">{title ?? 'Ledger Index'}</h3>
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted/70">{trades.length} entries</span>
      </div>
      <ul className="mt-3 space-y-2">
        {trades.map((trade, index) => {
          const isSelected = trade.trade_id === selectedId;
          return (
            <li key={trade.trade_id}>
              <button
                onClick={() => onSelect(trade, index)}
                className={clsx(
                  'flex w-full flex-col rounded-md border border-transparent px-3 py-2 text-left transition',
                  isSelected ? 'border-neon/70 bg-neon/10 text-neon shadow-glow' : 'bg-black/30 text-mint hover:border-neon/40',
                )}
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em]">
                  <span>{trade.ticker} • {trade.trade_type}</span>
                  <span className={clsx('rounded-full px-2 py-0.5 text-[10px]', trade.status === 'closed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-200')}>
                    {trade.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Updated {formatDateTime(trade.updatedAt)} • PnL {trade.pnl_usd != null ? trade.pnl_usd.toFixed(2) : '—'}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
