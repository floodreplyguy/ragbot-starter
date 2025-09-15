'use client';

import { useEffect, useMemo, useState } from 'react';
import NotebookPage from '@/components/journal/NotebookPage';
import NewEntryComposer, { ComposerAttachment } from '@/components/journal/NewEntryComposer';
import TradeEditor from '@/components/journal/TradeEditor';
import SearchBar from '@/components/journal/SearchBar';
import TradeNavigator from '@/components/journal/TradeNavigator';
import AnalyticsOverlay from '@/components/analytics/AnalyticsOverlay';
import type { SearchFilters, TradeAnalytics, TradeEntry } from '@/types/trade';

interface StatusMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

const isWinningTrade = (trade: TradeEntry) => {
  if (typeof trade.pnl_usd === 'number') return trade.pnl_usd > 0;
  if (typeof trade.pnl_pct === 'number') return trade.pnl_pct > 0;
  return false;
};

const fetchJson = async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }
  return data;
};

export default function Home() {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [processingEntry, setProcessingEntry] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [flipDirection, setFlipDirection] = useState<'forward' | 'backward' | null>(null);
  const [searchResults, setSearchResults] = useState<TradeEntry[] | null>(null);
  const [searchNarrative, setSearchNarrative] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeFilters, setActiveFilters] = useState<SearchFilters | undefined>(undefined);
  const [editingTrade, setEditingTrade] = useState<TradeEntry | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<TradeAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const visibleTrades = searchResults ?? trades;
  const selectedTrade = visibleTrades[selectedIndex] ?? null;

  useEffect(() => {
    const loadTrades = async () => {
      try {
        const data = await fetchJson<{ trades: TradeEntry[] }>('/api/trades');
        setTrades(data.trades ?? []);
        setSelectedIndex(0);
      } catch (error) {
        setStatusMessage({ type: 'error', text: (error as Error).message ?? 'Failed to load trades' });
      } finally {
        setLoadingTrades(false);
      }
    };
    loadTrades();
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timeout = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (!visibleTrades.length) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= visibleTrades.length) {
      setSelectedIndex(Math.max(visibleTrades.length - 1, 0));
    }
  }, [visibleTrades.length, selectedIndex]);

  const summary = useMemo(() => {
    const total = trades.length;
    const open = trades.filter((trade) => trade.status === 'open').length;
    const closed = trades.filter((trade) => trade.status === 'closed');
    const wins = closed.filter((trade) => isWinningTrade(trade)).length;
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    const recent = trades.slice(0, 3);
    return { total, open, winRate, recent };
  }, [trades]);

  const refreshAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const data = await fetchJson<{ analytics: TradeAnalytics }>('/api/analytics');
      setAnalytics(data.analytics);
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message ?? 'Failed to load analytics' });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const openAnalytics = async () => {
    setShowAnalytics(true);
    await refreshAnalytics();
  };

  const updateTradeState = (updated: TradeEntry) => {
    setTrades((prev) => {
      const filtered = prev.filter((trade) => trade.trade_id !== updated.trade_id);
      return [updated, ...filtered];
    });
    setSearchResults((prev) => {
      if (!prev) return prev;
      const exists = prev.some((trade) => trade.trade_id === updated.trade_id);
      if (!exists) return prev;
      return prev.map((trade) => (trade.trade_id === updated.trade_id ? updated : trade));
    });
  };

  const handleCreateEntry = async ({ note, attachments }: { note: string; attachments: ComposerAttachment[] }) => {
    setProcessingEntry(true);
    try {
      const data = await fetchJson<{ trade: TradeEntry; action: 'create' | 'update'; reasoning?: string }>('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, attachments }),
      });
      updateTradeState(data.trade);
      setSearchResults(null);
      setSelectedIndex(0);
      setStatusMessage({
        type: 'success',
        text: data.action === 'update' ? 'Existing trade updated with latest note.' : 'Trade logged in your journal!',
      });
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message ?? 'Unable to process journal entry' });
    } finally {
      setProcessingEntry(false);
    }
  };

  const handleSearch = async ({ query, filters }: { query: string; filters: SearchFilters }) => {
    if (!query.trim()) {
      setStatusMessage({ type: 'info', text: 'Enter a prompt to search the archive.' });
      return;
    }
    setSearching(true);
    try {
      const data = await fetchJson<{ results: TradeEntry[]; answer?: string }>('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters, includeAnswer: true }),
      });
      setSearchResults(data.results ?? []);
      setActiveFilters(filters);
      setSearchNarrative(data.answer ?? null);
      setSelectedIndex(0);
      setStatusMessage({ type: 'success', text: `Found ${data.results?.length ?? 0} trades matching your query.` });
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message ?? 'Search failed' });
    } finally {
      setSearching(false);
    }
  };

  const handleResetSearch = () => {
    setSearchResults(null);
    setActiveFilters(undefined);
    setSearchNarrative(null);
    setStatusMessage({ type: 'info', text: 'Search filters cleared. Showing full journal.' });
  };

  const handlePrev = () => {
    if (selectedIndex <= 0) return;
    setFlipDirection('backward');
    setSelectedIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    if (selectedIndex >= visibleTrades.length - 1) return;
    setFlipDirection('forward');
    setSelectedIndex((prev) => Math.min(prev + 1, visibleTrades.length - 1));
  };

  const handleSelectTrade = (trade: TradeEntry, index: number) => {
    setFlipDirection(index > selectedIndex ? 'forward' : 'backward');
    setSelectedIndex(index);
  };

  const handleSaveEdit = async (payload: {
    trade: Partial<TradeEntry>;
    note?: string;
    attachments?: ComposerAttachment[];
    removeAttachmentIds?: string[];
    reanalyze?: boolean;
  }) => {
    if (!editingTrade) return;
    setSavingEdit(true);
    try {
      const data = await fetchJson<{ trade: TradeEntry }>(`/api/trades/${editingTrade.trade_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      updateTradeState(data.trade);
      setStatusMessage({ type: 'success', text: 'Trade updated.' });
      setEditingTrade(null);
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message ?? 'Failed to update trade' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <main className="min-h-screen bg-radial text-mint">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-[#123] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-4xl uppercase tracking-[0.5em] text-neon">Neon Trade Journal</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Welcome to your retro-futuristic trading log. Chronicle setups, emotions, outcomes, and let the AI distill
              structure from the chaos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-[#1b3535] bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.3em] text-muted">
              Entries {summary.total}
            </div>
            <button
              onClick={openAnalytics}
              className="rounded-md border border-neon/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.35em] text-neon transition hover:bg-neon/10"
            >
              Analytics HUD
            </button>
          </div>
        </header>

        {statusMessage && (
          <div
            className={`mt-4 rounded-md border px-4 py-3 text-sm ${
              statusMessage.type === 'error'
                ? 'border-red-500/40 bg-red-500/10 text-red-200'
                : statusMessage.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-neon/40 bg-neon/5 text-neon'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)]">
          <div className="space-y-6">
            <SearchBar
              onSearch={handleSearch}
              onReset={handleResetSearch}
              searching={searching}
              activeFilters={activeFilters}
            />

            {loadingTrades ? (
              <div className="notebook-page flex items-center justify-center text-muted">
                Initializing retro notebook...
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <NotebookPage trade={selectedTrade ?? null} flipDirection={flipDirection} onEdit={setEditingTrade} />
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted">
                    <button
                      onClick={handlePrev}
                      disabled={selectedIndex === 0}
                      className="rounded-md border border-[#1b3535] px-3 py-1 transition hover:border-neon hover:text-neon disabled:opacity-40"
                    >
                      Prev Page
                    </button>
                    <span>
                      Page {visibleTrades.length ? selectedIndex + 1 : 0} / {visibleTrades.length}
                    </span>
                    <button
                      onClick={handleNext}
                      disabled={selectedIndex >= visibleTrades.length - 1}
                      className="rounded-md border border-[#1b3535] px-3 py-1 transition hover:border-neon hover:text-neon disabled:opacity-40"
                    >
                      Next Page
                    </button>
                  </div>
                </div>
                <TradeNavigator
                  trades={visibleTrades}
                  selectedId={selectedTrade?.trade_id}
                  onSelect={handleSelectTrade}
                  title={searchResults ? 'Search Results' : 'Ledger Index'}
                />
                {searchNarrative && (
                  <div className="retro-panel p-4 text-sm text-mint/80">
                    <h3 className="text-[11px] uppercase tracking-[0.35em] text-muted">AI Summary</h3>
                    <p className="mt-2 whitespace-pre-line">{searchNarrative}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <NewEntryComposer onSubmit={handleCreateEntry} isProcessing={processingEntry} />
            <section className="retro-panel space-y-4 p-4">
              <h2 className="text-[11px] uppercase tracking-[0.35em] text-muted">Mission Control</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-[#1f3c3c] bg-black/40 p-3">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Open</span>
                  <p className="mt-1 text-xl font-semibold text-neon">{summary.open}</p>
                </div>
                <div className="rounded-md border border-[#1f3c3c] bg-black/40 p-3">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Win Rate</span>
                  <p className="mt-1 text-xl font-semibold text-neon">{summary.winRate.toFixed(1)}%</p>
                </div>
              </div>
              <div>
                <h3 className="text-[10px] uppercase tracking-[0.3em] text-muted">Recent Entries</h3>
                <ul className="mt-2 space-y-2 text-sm text-muted">
                  {summary.recent.map((trade) => (
                    <li key={trade.trade_id} className="rounded-md border border-[#1f3c3c] bg-black/30 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-mint">{trade.ticker} • {trade.trade_type}</span>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-muted">{trade.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Last noted {new Date(trade.updatedAt).toLocaleString()} • PnL {trade.pnl_usd != null ? trade.pnl_usd.toFixed(2) : '—'}
                      </p>
                    </li>
                  ))}
                  {summary.recent.length === 0 && <li>No entries yet.</li>}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>

      {editingTrade && (
        <TradeEditor
          trade={editingTrade}
          onClose={() => setEditingTrade(null)}
          onSave={handleSaveEdit}
          isSaving={savingEdit}
        />
      )}

      {showAnalytics && (
        <AnalyticsOverlay
          analytics={analytics}
          loading={analyticsLoading}
          onClose={() => setShowAnalytics(false)}
          onRefresh={refreshAnalytics}
        />
      )}
    </main>
  );
}
