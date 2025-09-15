'use client';

import Image from 'next/image';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { TradeEntry } from '@/types/trade';
import { formatCurrency, formatDateTime, formatDuration, formatPercentage } from '@/lib/format';

interface NotebookPageProps {
  trade: TradeEntry | null;
  flipDirection?: 'forward' | 'backward' | null;
  onEdit?: (trade: TradeEntry) => void;
}

const metric = (label: string, value: string | number) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-[0.25em] text-muted">{label}</span>
    <span className="font-semibold text-mint">{value}</span>
  </div>
);

export default function NotebookPage({ trade, flipDirection, onEdit }: NotebookPageProps) {
  const [flipClass, setFlipClass] = useState('');

  useEffect(() => {
    if (!flipDirection) return;
    setFlipClass(flipDirection === 'forward' ? 'animate-page-flip-forward' : 'animate-page-flip-backward');
    const timeout = setTimeout(() => setFlipClass(''), 600);
    return () => clearTimeout(timeout);
  }, [flipDirection, trade?.trade_id]);

  if (!trade) {
    return (
      <div className="notebook-page flex flex-col items-center justify-center text-muted">
        <p>No trades logged yet. Start by writing your first journal entry.</p>
      </div>
    );
  }

  return (
    <div className={clsx('notebook-page', flipClass)}>
      <header className="flex items-start justify-between">
        <div>
          <h3 className="font-mono text-3xl uppercase tracking-[0.4em] text-neon">
            {trade.ticker} <span className="text-base text-muted">{trade.trade_type}</span>
          </h3>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">
            {trade.status === 'open' ? 'Open Position' : 'Closed Trade'} • Last updated {formatDateTime(trade.updatedAt)}
          </p>
        </div>
        {onEdit && (
          <button
            onClick={() => onEdit(trade)}
            className="rounded-md border border-neon/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-neon transition hover:bg-neon/10"
          >
            Edit Page
          </button>
        )}
      </header>

      <section className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
        {metric('Entry', trade.entry_price != null ? formatCurrency(trade.entry_price) : '—')}
        {metric('Exit', trade.exit_price != null ? formatCurrency(trade.exit_price) : '—')}
        {metric('Size', trade.size != null ? trade.size : '—')}
        {metric('PnL (USD)', trade.pnl_usd != null ? formatCurrency(trade.pnl_usd) : '—')}
        {metric('PnL (%)', trade.pnl_pct != null ? formatPercentage(trade.pnl_pct) : '—')}
        {metric('R / R', trade.rr_ratio != null ? trade.rr_ratio.toFixed(2) : '—')}
        {metric('Duration', formatDuration(trade.duration_minutes))}
        {metric('Sentiment', trade.sentiment ?? '—')}
        {metric('Opened', formatDateTime(trade.opened_at))}
        {metric('Closed', trade.closed_at ? formatDateTime(trade.closed_at) : '—')}
      </section>

      <section className="mt-6">
        <h4 className="text-[11px] uppercase tracking-[0.35em] text-muted">Journal Notes</h4>
        <div className="mt-3 space-y-3 rounded-md border border-[#1b3535] bg-black/30 p-3 text-sm leading-relaxed text-mint shadow-inner">
          {trade.notes.map((note) => (
            <article key={note.id} className="rounded-sm bg-black/40 p-3 shadow-card">
              <header className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-muted">
                <span>{formatDateTime(note.createdAt)}</span>
                <span>#{trade.trade_id.slice(0, 6)}</span>
              </header>
              <p className="whitespace-pre-line text-mint/90">{note.text}</p>
            </article>
          ))}
        </div>
      </section>

      {trade.raw_summary && (
        <section className="mt-6">
          <h4 className="text-[11px] uppercase tracking-[0.35em] text-muted">AI Synopsis</h4>
          <p className="mt-2 rounded-md border border-[#1b3535] bg-black/30 p-3 text-sm text-mint/80">
            {trade.raw_summary}
          </p>
        </section>
      )}

      {trade.attachments.length > 0 && (
        <section className="mt-6">
          <h4 className="text-[11px] uppercase tracking-[0.35em] text-muted">Attachments</h4>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {trade.attachments.map((attachment) => (
              <figure
                key={attachment.id}
                className="overflow-hidden rounded-md border border-[#1b3535] bg-black/30 shadow-card"
              >
                <Image
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  width={320}
                  height={128}
                  unoptimized
                  className="h-32 w-full object-cover"
                />
                <figcaption className="px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-muted">
                  {attachment.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
