import type { Asset, HistoryPoint, InvestmentHoldingRow, PortfolioSummary, Transaction } from '../types';
import {
  calculateBehaviorStats,
  calculateBenchmarkComparison,
  calculateDiversificationScore,
  calculatePortfolioHistory,
  calculatePulsechainCoreRotationPnlPls,
  calculateRiskMetrics,
  extractPulsechainCoreRotationSwaps,
  type BehaviorStats,
  type BenchmarkComparison,
  type PortfolioAnalyticsPoint,
  type PulsechainCoreRotationPnl,
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
  rotation: PulsechainCoreRotationPnl;
  alerts: WalletAnalyzerAlert[];
}

interface BuildWalletAnalyzerModelArgs {
  history: HistoryPoint[];
  assets: Asset[];
  summary: PortfolioSummary;
  transactions: Transaction[];
  investmentRows: InvestmentHoldingRow[];
  currentPrices: Record<string, number>;
}

function formatPointLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildBenchmarkHistory(history: HistoryPoint[]): HistoryPoint[] {
  if (history.length === 0) return [];
  const firstValue = history[0]!.value || 1;
  return history.map((point, index) => ({
    ...point,
    value: firstValue * (1 + index * 0.015),
  }));
}

function resolveCurrentPlsUsdPrice(currentPrices: Record<string, number>): number {
  return currentPrices['pulsechain']
    ?? currentPrices['pulsechain:native']
    ?? currentPrices.PLS
    ?? currentPrices.WPLS
    ?? 0;
}

export function buildWalletAnalyzerModel({
  history,
  assets,
  summary,
  transactions,
  investmentRows,
  currentPrices,
}: BuildWalletAnalyzerModelArgs): WalletAnalyzerModel {
  const canonicalRows = investmentRows.filter((row) => row.currentValue > 0);
  const performancePoints = calculatePortfolioHistory(history).map((point) => ({
    ...point,
    label: formatPointLabel(point.timestamp),
  }));
  const risk = calculateRiskMetrics(history);
  const benchmarkHistory = buildBenchmarkHistory(history);
  const benchmarkPoints = benchmarkHistory.map((point) => ({
    timestamp: point.timestamp,
    value: point.value,
    label: formatPointLabel(point.timestamp),
  }));
  const comparison = calculateBenchmarkComparison(history, benchmarkHistory);
  const behavior = calculateBehaviorStats(transactions, currentPrices);
  const currentPlsUsdPrice = resolveCurrentPlsUsdPrice(currentPrices);
  const rotation = calculatePulsechainCoreRotationPnlPls(
    extractPulsechainCoreRotationSwaps(transactions),
    currentPrices,
    currentPlsUsdPrice,
    () => currentPlsUsdPrice,
  );
  const allocationTotal = canonicalRows.reduce((sum, row) => sum + row.currentValue, 0);
  const topHoldings = [...canonicalRows]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 5)
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      chain: row.chain,
      valueUsd: row.currentValue,
      weight: allocationTotal > 0 ? row.currentValue / allocationTotal : 0,
    }));
  const concentration = topHoldings[0]?.weight ?? 0;
  const contributors = [...canonicalRows]
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
  const chainMixByValue = canonicalRows.reduce<Record<Asset['chain'], number>>(
    (acc, row) => {
      acc[row.chain] += row.currentValue;
      return acc;
    },
    { pulsechain: 0, ethereum: 0, base: 0 },
  );
  const chainMixRows = (Object.entries(chainMixByValue) as Array<[Asset['chain'], number]>)
    .filter(([, valueUsd]) => valueUsd > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([chain, valueUsd]) => ({
      chain,
      valueUsd,
      weight: allocationTotal > 0 ? valueUsd / allocationTotal : 0,
    }));
  const diversificationScore = calculateDiversificationScore(
    canonicalRows.reduce<Record<string, number>>((acc, row) => {
      acc[`${row.chain}:${row.symbol}`] = row.currentValue;
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
      totalValue: allocationTotal > 0 ? allocationTotal : summary.totalValue,
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
    rotation,
    alerts,
  };
}
