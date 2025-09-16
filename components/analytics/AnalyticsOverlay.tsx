'use client';

import type { TradeAnalytics } from '@/types/trade';
import { formatCurrency, formatDuration, formatPercentage } from '@/lib/format';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import clsx from 'clsx';

interface AnalyticsOverlayProps {
  analytics: TradeAnalytics | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-[#1b3535] bg-black/40 p-4 shadow-card">
    <span className="text-[10px] uppercase tracking-[0.3em] text-muted">{label}</span>
    <p className="mt-2 text-xl font-semibold text-neon">{value}</p>
  </div>
);

export default function AnalyticsOverlay({ analytics, loading, onClose, onRefresh }: AnalyticsOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-lg">
      <div className="w-full max-w-5xl rounded-xl border border-[#1b3535] bg-[#050d0e]/95 p-6 shadow-holo">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-mono text-2xl uppercase tracking-[0.4em] text-neon">Analytics HUD</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Retro-futuristic overview of your trading performance</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={loading}
              className={clsx(
                'rounded-md border border-[#1f3c3c] px-4 py-2 text-xs uppercase tracking-[0.3em] text-muted transition hover:border-neon hover:text-neon',
                loading && 'opacity-50',
              )}
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="rounded-md bg-neon/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-ink transition hover:bg-neon"
            >
              Close
            </button>
          </div>
        </header>

        {loading && (
          <div className="mt-8 flex items-center justify-center text-neon">
            <p>Compiling holographic metrics...</p>
          </div>
        )}

        {!loading && analytics && (
          <div className="mt-8 space-y-8">
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Trades" value={String(analytics.totalTrades)} />
              <MetricCard label="Open Positions" value={String(analytics.openTrades)} />
              <MetricCard label="Win Rate" value={formatPercentage(analytics.winRate)} />
              <MetricCard
                label="Avg Hold"
                value={analytics.averageHoldMinutes != null ? formatDuration(analytics.averageHoldMinutes) : '—'}
              />
              <MetricCard
                label="Average R:R"
                value={analytics.averageRR != null ? analytics.averageRR.toFixed(2) : '—'}
              />
              <MetricCard label="Longest Win Streak" value={String(analytics.longestWinStreak)} />
              <MetricCard label="Current Win Streak" value={String(analytics.currentWinStreak)} />
              <MetricCard
                label="Net PnL"
                value={formatCurrency(
                  analytics.pnlTimeline.length
                    ? analytics.pnlTimeline[analytics.pnlTimeline.length - 1].cumulativePnlUsd
                    : 0,
                )}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="retro-panel h-[260px] p-4">
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-muted">PnL Timeline</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.pnlTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#123" />
                    <XAxis dataKey="date" stroke="#4dd0b3" hide />
                    <YAxis stroke="#4dd0b3" tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      contentStyle={{ background: '#051010', border: '1px solid #163939', color: '#4dd0b3' }}
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                    />
                    <Line type="monotone" dataKey="cumulativePnlUsd" stroke="#4dd0b3" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="retro-panel h-[260px] p-4">
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-muted">Performance by Ticker</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.performanceByTicker}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#123" />
                    <XAxis dataKey="ticker" stroke="#4dd0b3" />
                    <YAxis stroke="#4dd0b3" tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      contentStyle={{ background: '#051010', border: '1px solid #163939', color: '#4dd0b3' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar dataKey="totalPnlUsd" fill="#4dd0b3" name="PnL" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="retro-panel h-[260px] p-4">
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-muted">Sentiment Performance</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.sentimentPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#123" />
                    <XAxis dataKey="sentiment" stroke="#4dd0b3" />
                    <YAxis stroke="#4dd0b3" tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      contentStyle={{ background: '#051010', border: '1px solid #163939', color: '#4dd0b3' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar dataKey="averagePnlUsd" fill="#67e8f9" name="Avg PnL" />
                    <Bar dataKey="winRate" fill="#4dd0b3" name="Win Rate" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="retro-panel p-4">
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-muted">Highlight Reel</h3>
                <div className="mt-3 space-y-4 text-sm text-mint">
                  {analytics.bestTrade ? (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Best Trade</span>
                      <p className="mt-1 font-semibold text-neon">
                        {analytics.bestTrade.ticker} {analytics.bestTrade.trade_type.toUpperCase()} • {formatCurrency(analytics.bestTrade.pnl_usd ?? undefined)}
                      </p>
                    </div>
                  ) : (
                    <p>No winning trades logged yet.</p>
                  )}
                  {analytics.worstTrade ? (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Toughest Trade</span>
                      <p className="mt-1 font-semibold text-rose-300">
                        {analytics.worstTrade.ticker} {analytics.worstTrade.trade_type.toUpperCase()} • {formatCurrency(analytics.worstTrade.pnl_usd ?? undefined)}
                      </p>
                    </div>
                  ) : (
                    <p>No losing trades logged yet.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
