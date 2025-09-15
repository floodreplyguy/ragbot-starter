import type { TradeAnalytics, TradeEntry } from '../types/trade';

const isWin = (trade: TradeEntry) => {
  if (typeof trade.pnl_usd === 'number') {
    return trade.pnl_usd > 0;
  }
  if (typeof trade.pnl_pct === 'number') {
    return trade.pnl_pct > 0;
  }
  return false;
};

const toNumber = (value?: number | null) =>
  typeof value === 'number' && !Number.isNaN(value) ? value : undefined;

export const calculateAnalytics = (trades: TradeEntry[]): TradeAnalytics => {
  const totalTrades = trades.length;
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const openTrades = totalTrades - closedTrades.length;

  const rrValues = trades
    .map((t) => toNumber(t.rr_ratio))
    .filter((value): value is number => value !== undefined);
  const averageRR = rrValues.length
    ? rrValues.reduce((acc, value) => acc + value, 0) / rrValues.length
    : null;

  const holdTimes = trades
    .map((t) => toNumber(t.duration_minutes))
    .filter((value): value is number => value !== undefined);
  const averageHoldMinutes = holdTimes.length
    ? holdTimes.reduce((acc, value) => acc + value, 0) / holdTimes.length
    : null;

  const winCount = closedTrades.filter((trade) => isWin(trade)).length;
  const winRate = closedTrades.length ? (winCount / closedTrades.length) * 100 : 0;

  let longestWinStreak = 0;
  let currentWinStreak = 0;
  const sortedByClose = [...closedTrades].sort((a, b) => {
    const aDate = a.closed_at ? new Date(a.closed_at).getTime() : 0;
    const bDate = b.closed_at ? new Date(b.closed_at).getTime() : 0;
    return aDate - bDate;
  });
  sortedByClose.forEach((trade) => {
    if (isWin(trade)) {
      currentWinStreak += 1;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else {
      currentWinStreak = 0;
    }
  });

  const bestTrade = closedTrades.reduce<TradeEntry | null>((best, trade) => {
    const tradeScore = toNumber(trade.pnl_usd) ?? toNumber(trade.pnl_pct) ?? -Infinity;
    if (!best) return trade;
    const bestScore = toNumber(best.pnl_usd) ?? toNumber(best.pnl_pct) ?? -Infinity;
    return tradeScore > bestScore ? trade : best;
  }, null);

  const worstTrade = closedTrades.reduce<TradeEntry | null>((worst, trade) => {
    const tradeScore = toNumber(trade.pnl_usd) ?? toNumber(trade.pnl_pct) ?? Infinity;
    if (!worst) return trade;
    const worstScore = toNumber(worst.pnl_usd) ?? toNumber(worst.pnl_pct) ?? Infinity;
    return tradeScore < worstScore ? trade : worst;
  }, null);

  const performanceByTickerMap = new Map<string, { trades: number; totalPnlUsd: number; winCount: number }>();
  trades.forEach((trade) => {
    const key = trade.ticker.toUpperCase();
    const entry = performanceByTickerMap.get(key) ?? { trades: 0, totalPnlUsd: 0, winCount: 0 };
    entry.trades += 1;
    entry.totalPnlUsd += toNumber(trade.pnl_usd) ?? 0;
    if (isWin(trade)) entry.winCount += 1;
    performanceByTickerMap.set(key, entry);
  });

  const performanceByTicker = Array.from(performanceByTickerMap.entries()).map(([ticker, stats]) => ({
    ticker,
    trades: stats.trades,
    totalPnlUsd: stats.totalPnlUsd,
    winRate: stats.trades ? (stats.winCount / stats.trades) * 100 : 0,
  }));

  const sentimentPerformanceMap = new Map<string, { trades: number; totalPnlUsd: number; winCount: number }>();
  trades.forEach((trade) => {
    const sentimentKey = (trade.sentiment ?? 'unspecified').toLowerCase();
    const entry = sentimentPerformanceMap.get(sentimentKey) ?? { trades: 0, totalPnlUsd: 0, winCount: 0 };
    entry.trades += 1;
    entry.totalPnlUsd += toNumber(trade.pnl_usd) ?? 0;
    if (isWin(trade)) entry.winCount += 1;
    sentimentPerformanceMap.set(sentimentKey, entry);
  });

  const sentimentPerformance = Array.from(sentimentPerformanceMap.entries()).map(([sentiment, stats]) => ({
    sentiment,
    trades: stats.trades,
    averagePnlUsd: stats.trades ? stats.totalPnlUsd / stats.trades : 0,
    winRate: stats.trades ? (stats.winCount / stats.trades) * 100 : 0,
  }));

  const pnlTimeline = trades
    .map((trade) => ({
      date: trade.closed_at ?? trade.createdAt,
      pnlUsd: toNumber(trade.pnl_usd) ?? 0,
      trade,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry, index, array) => {
      const cumulativePnlUsd = array
        .slice(0, index + 1)
        .reduce((acc, current) => acc + (current.pnlUsd ?? 0), 0);
      return {
        date: entry.date,
        cumulativePnlUsd,
        trade_id: entry.trade.trade_id,
        label: `${entry.trade.ticker} ${entry.trade.trade_type.toUpperCase()}`,
      };
    });

  return {
    totalTrades,
    openTrades,
    closedTrades: closedTrades.length,
    winRate,
    averageRR,
    averageHoldMinutes,
    longestWinStreak,
    currentWinStreak,
    bestTrade,
    worstTrade,
    performanceByTicker,
    sentimentPerformance,
    pnlTimeline,
  };
};
