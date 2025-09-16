'use client';

import { useState } from 'react';
import type { SearchFilters } from '@/types/trade';
import clsx from 'clsx';

interface SearchBarProps {
  onSearch: (payload: { query: string; filters: SearchFilters }) => Promise<void>;
  onReset: () => void;
  searching: boolean;
  activeFilters?: SearchFilters;
}

export default function SearchBar({ onSearch, onReset, searching, activeFilters }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchFilters['status']>(activeFilters?.status);
  const [ticker, setTicker] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSearch({
      query,
      filters: {
        status: status || undefined,
        tickers: ticker ? [ticker.toUpperCase()] : undefined,
        sentiments: sentiment ? [sentiment] : undefined,
        from: from || undefined,
        to: to || undefined,
      },
    });
  };

  const reset = () => {
    setQuery('');
    setStatus(undefined);
    setTicker('');
    setSentiment('');
    setFrom('');
    setTo('');
    onReset();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="retro-panel flex flex-col gap-4 p-4"
      aria-label="Search trades"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-neon font-semibold uppercase tracking-[0.35em]">Search</h2>
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
          Query past trades, emotions, or performance metrics
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Show me all losing trades where I was fearful..."
          className="flex-1 min-w-[220px] rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
        />
        <select
          value={status ?? ''}
          onChange={(event) => setStatus(event.target.value ? (event.target.value as SearchFilters['status']) : undefined)}
          className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
        >
          <option value="">Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <input
          value={ticker}
          onChange={(event) => setTicker(event.target.value)}
          placeholder="Ticker"
          className="w-28 rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
        />
        <input
          value={sentiment}
          onChange={(event) => setSentiment(event.target.value)}
          placeholder="Sentiment"
          className="w-32 rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
        />
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={searching}
            className={clsx(
              'rounded-md bg-neon/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-ink transition hover:bg-neon',
              searching && 'opacity-50',
            )}
          >
            Search
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-[#1f3c3c] px-4 py-2 text-xs uppercase tracking-[0.3em] text-muted transition hover:border-neon hover:text-neon"
          >
            Reset
          </button>
        </div>
      </div>
    </form>
  );
}
