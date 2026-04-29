import type { Asset, HistoryPoint, InvestmentHoldingRow, PortfolioSummary, Transaction } from '../types';
import {
  calculateBehaviorStats,
  calculateBenchmarkComparison,
  calculateDiversificationScore,
  calculatePortfolioHistory,
  calculateRiskMetrics,
  type BehaviorStats,
  type BenchmarkComparison,
  type PortfolioAnalyticsPoint,
  type RiskMetrics,
} from './portfolioAnalytics';

export interface WalletAnalyzerAlert {
  id: string;
  title: string;
  tone: 'warning' | 'info';
  detail: string;
}

export interface WalletAnalyzerAllocationRow {
  symbol: string;
  name: string;
  chain: Asset['chain'];
  valueUsd: number;
  weight: number;
}

export interface WalletAnalyzerModel {
  nav: {
    totalValue: number;
    cumulativeReturn: number;
    maxDrawdown: number;
    volatility: number;
    sharpeRatio: number;
    diversificationScore: number;
  };
  performance: {
    points: Array<PortfolioAnalyticsPoint & { label: string }>;
    benchmarkPoints: Array<{ timestamp: number; value: number; label: string }>;
    comparison: BenchmarkComparison;
  };
  risk: RiskMetrics;
  behavior: BehaviorStats;
  allocation: {
    topHoldings: WalletAnalyzerAllocationRow[];
    concentration: number;
  };
  contributors: {
    topHoldings: Array<{
      id: string;
      symbol: string;
      name: string;
      chain: Asset['chain'];
      currentValue: number;
      moveUsd: number;
      pnlUsd: number;
      shareOfNav: number;
    }>;
  };
  chainMix: {
    rows: Array<{
      chain: Asset['chain'];
      valueUsd: number;
      weight: number;
    }>;
  };
  alerts: WalletAnalyzerAlert[];
}

interface BuildWalletAnalyzerModelArgs {
  history: HistoryPoint[];
  assets: Asset[];
  summary: PortfolioSummary;
  transactions: Transaction[];
  investmentRows: InvestmentHoldingRow[];
  currentPrices: Record<string, number>;
  /** Real PLS/ETH benchmark HistoryPoint[]. Falls back to synthetic if omitted. */
  benchmarkHistory?: HistoryPoint[];
}

function formatPointLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Fallback: synthetic +1.5%/point benchmark used when real price data is unavailable. */
function buildSyntheticBenchmarkHistory(history: HistoryPoint[]): HistoryPoint[] {
  if (history.length === 0) return [];
  const firstValue = history[0]!.value || 1;
  return history.map((point, index) => ({
    ...point,
    value: firstValue * (1 + index * 0.015),
  }));
}

export function buildWalletAnalyzerModel({
  history,
  assets,
  summary,
  transactions,
  investmentRows,
  currentPrices,
  benchmarkHistory: externalBenchmarkHistory,
}: BuildWalletAnalyzerModelArgs): WalletAnalyzerModel {
  const performancePoints = calculatePortfolioHistory(history).map((point) => ({
    ...point,
    label: formatPointLabel(point.timestamp),
  }));
  const risk = calculateRiskMetrics(history);
  // Use real benchmark if provided, otherwise fall back to synthetic
  const benchmarkHistory = externalBenchmarkHistory && externalBenchmarkHistory.length > 0
    ? externalBenchmarkHistory
    : buildSyntheticBenchmarkHistory(history);
  const benchmarkPoints = benchmarkHistory.map((point) => ({
    timestamp: point.timestamp,
    value: point.value,
    label: formatPointLabel(point.timestamp),
  }));
  const comparison = calculateBenchmarkComparison(history, benchmarkHistory);
  const behavior = calculateBehaviorStats(transactions, currentPrices);
  const allocationTotal = assets.reduce((sum, asset) => sum + asset.value, 0);
  const topHoldings = [...assets]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      chain: asset.chain,
      valueUsd: asset.value,
      weight: allocationTotal > 0 ? asset.value / allocationTotal : 0,
    }));
  const concentration = topHoldings[0]?.weight ?? 0;
  const contributors = [...investmentRows]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      chain: row.chain,
      currentValue: row.currentValue,
      moveUsd: row.nowValue - row.thenValue,
      pnlUsd: row.pnlUsd,
      shareOfNav: summary.totalValue > 0 ? row.currentValue / summary.totalValue : 0,
    }));
  const chainMixRows = (Object.entries(summary.chainDistribution) as Array<[Asset['chain'], number]>)
    .filter(([, valueUsd]) => valueUsd > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([chain, valueUsd]) => ({
      chain,
      valueUsd,
      weight: summary.totalValue > 0 ? valueUsd / summary.totalValue : 0,
    }));
  const diversificationScore = calculateDiversificationScore(
    assets.reduce<Record<string, number>>((acc, asset) => {
      acc[`${asset.chain}:${asset.symbol}`] = asset.value;
      return acc;
    }, {}),
  );

  const alerts: WalletAnalyzerAlert[] = [];
  if (concentration >= 0.5) {
    alerts.push({
      id: 'concentration',
      title: 'High concentration',
      tone: 'warning',
      detail: `${topHoldings[0]?.symbol ?? 'Top asset'} is ${Math.round(concentration * 100)}% of current value.`,
    });
  }
  if (risk.maxDrawdown <= -0.1) {
    alerts.push({
      id: 'drawdown',
      title: 'Drawdown watch',
      tone: 'warning',
      detail: `Peak-to-trough drawdown is ${Math.abs(risk.maxDrawdown * 100).toFixed(1)}%.`,
    });
  }
  const unrealizedDominance = Math.abs(behavior.unrealizedGainUsd) > Math.abs(behavior.realizedGainUsd) * 2;
  if (unrealizedDominance && investmentRows.length > 0) {
    alerts.push({
      id: 'unrealized',
      title: 'Unrealized gains dominate',
      tone: 'info',
      detail: 'Most performance is still in open positions rather than realized exits.',
    });
  }

  return {
    nav: {
      totalValue: summary.totalValue,
      cumulativeReturn: comparison.portfolioReturn,
      maxDrawdown: risk.maxDrawdown,
      volatility: risk.volatility,
      sharpeRatio: risk.sharpeRatio,
      diversificationScore,
    },
    performance: {
      points: performancePoints,
      benchmarkPoints,
      comparison,
    },
    risk,
    behavior,
    allocation: {
      topHoldings,
      concentration,
    },
    contributors: {
      topHoldings: contributors,
    },
    chainMix: {
      rows: chainMixRows,
    },
    alerts,
  };
}
