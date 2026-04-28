import type { Chain, HistoryPoint, Transaction } from '../types';

export interface PortfolioAnalyticsPoint extends HistoryPoint {
  dailyReturn: number;
  cumulativeReturn: number;
  drawdown: number;
}

export interface RiskMetrics {
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface BenchmarkComparison {
  portfolioReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
}

export interface BehaviorStats {
  averageHoldingPeriodDays: number;
  realizedGainUsd: number;
  unrealizedCostBasisUsd: number;
  unrealizedValueUsd: number;
  unrealizedGainUsd: number;
  realizedSalesCount: number;
}

export interface ChainAttributionRow {
  chain: Chain;
  moveUsd: number;
  startValueUsd: number;
  endValueUsd: number;
}

type Lot = {
  amount: number;
  unitCostUsd: number;
  timestamp: number;
};

function sortHistory(history: HistoryPoint[]): HistoryPoint[] {
  return [...history].sort((a, b) => a.timestamp - b.timestamp);
}

function getReturn(startValue: number, endValue: number): number {
  if (startValue <= 0) return 0;
  return endValue / startValue - 1;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function holdingKey(chain: string, asset: string): string {
  return `${chain}:${asset}`.toUpperCase();
}

function getAcquisitionValueUsd(tx: Transaction): number {
  if (typeof tx.valueUsd === 'number') return tx.valueUsd;
  if (typeof tx.assetPriceUsdAtTx === 'number') return tx.assetPriceUsdAtTx * tx.amount;
  return 0;
}

function getDisposalValueUsd(tx: Transaction): number {
  if (typeof tx.valueUsd === 'number') return tx.valueUsd;
  if (typeof tx.amount === 'number' && typeof tx.assetPriceUsdAtTx === 'number') {
    return tx.amount * tx.assetPriceUsdAtTx;
  }
  if (typeof tx.counterAmount === 'number' && typeof tx.counterPriceUsdAtTx === 'number') {
    return tx.counterAmount * tx.counterPriceUsdAtTx;
  }
  return 0;
}

export function calculatePortfolioHistory(history: HistoryPoint[]): PortfolioAnalyticsPoint[] {
  const sorted = sortHistory(history);
  if (sorted.length === 0) return [];

  const initialValue = sorted[0]?.value ?? 0;
  let runningPeak = Number.NEGATIVE_INFINITY;

  return sorted.map((point, index) => {
    const previous = sorted[index - 1];
    const dailyReturn = previous ? getReturn(previous.value, point.value) : 0;
    const cumulativeReturn = getReturn(initialValue, point.value);
    runningPeak = Math.max(runningPeak, point.value);
    const drawdown = runningPeak > 0 ? point.value / runningPeak - 1 : 0;

    return {
      ...point,
      dailyReturn,
      cumulativeReturn,
      drawdown,
    };
  });
}

export function calculateRiskMetrics(history: HistoryPoint[]): RiskMetrics {
  const analytics = calculatePortfolioHistory(history);
  const returns = analytics.slice(1).map((point) => point.dailyReturn);
  const volatility = standardDeviation(returns) * Math.sqrt(365);
  const averageReturn = returns.length > 0
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : 0;
  const sharpeRatio = volatility > 0 ? (averageReturn * Math.sqrt(365)) / volatility : 0;
  const maxDrawdown = analytics.reduce((lowest, point) => Math.min(lowest, point.drawdown), 0);

  return {
    volatility,
    sharpeRatio,
    maxDrawdown,
  };
}

export function calculateDiversificationScore(allocationValues: Record<string, number>): number {
  const values = Object.values(allocationValues).filter((value) => value > 0);
  if (values.length <= 1) return 0;

  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;

  const hhi = values.reduce((sum, value) => {
    const weight = value / total;
    return sum + weight ** 2;
  }, 0);
  const floor = 1 / values.length;
  const normalized = (1 - hhi) / (1 - floor);

  return Math.max(0, Math.min(100, normalized * 100));
}

export function calculateBenchmarkComparison(
  portfolioHistory: HistoryPoint[],
  benchmarkHistory: HistoryPoint[],
): BenchmarkComparison {
  const portfolio = sortHistory(portfolioHistory);
  const benchmark = sortHistory(benchmarkHistory);

  if (portfolio.length === 0 || benchmark.length === 0) {
    return { portfolioReturn: 0, benchmarkReturn: 0, excessReturn: 0 };
  }

  const portfolioReturn = getReturn(portfolio[0]!.value, portfolio[portfolio.length - 1]!.value);
  const benchmarkReturn = getReturn(benchmark[0]!.value, benchmark[benchmark.length - 1]!.value);

  return {
    portfolioReturn,
    benchmarkReturn,
    excessReturn: portfolioReturn - benchmarkReturn,
  };
}

export function calculateBehaviorStats(
  transactions: Transaction[],
  currentPrices: Record<string, number>,
  nowTimestamp = Date.now(),
): BehaviorStats {
  const lotsByAsset = new Map<string, Lot[]>();
  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const normalizedPrices = Object.entries(currentPrices).reduce<Record<string, number>>((acc, [key, value]) => {
    acc[key.toUpperCase()] = value;
    return acc;
  }, {});

  let realizedGainUsd = 0;
  let realizedSalesCount = 0;
  let holdingPeriodWeightedDays = 0;
  let holdingPeriodWeight = 0;

  const getLots = (key: string): Lot[] => {
    const existing = lotsByAsset.get(key);
    if (existing) return existing;
    const created: Lot[] = [];
    lotsByAsset.set(key, created);
    return created;
  };

  const addLot = (key: string, amount: number, totalCostUsd: number, timestamp: number): void => {
    if (amount <= 0) return;
    getLots(key).push({
      amount,
      unitCostUsd: amount > 0 ? totalCostUsd / amount : 0,
      timestamp,
    });
  };

  const consumeLots = (
    key: string,
    amount: number,
    referenceTimestamp: number,
  ): { costBasisUsd: number; holdingDaysWeighted: number; consumedAmount: number } => {
    const lots = getLots(key);
    let remaining = amount;
    let costBasisUsd = 0;
    let holdingDaysWeighted = 0;
    let consumedAmount = 0;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0]!;
      const takeAmount = Math.min(lot.amount, remaining);
      costBasisUsd += takeAmount * lot.unitCostUsd;
      holdingDaysWeighted += takeAmount * ((referenceTimestamp - lot.timestamp) / 86_400_000);
      consumedAmount += takeAmount;
      lot.amount -= takeAmount;
      remaining -= takeAmount;

      if (lot.amount <= 0) {
        lots.shift();
      }
    }

    return { costBasisUsd, holdingDaysWeighted, consumedAmount };
  };

  for (const tx of sorted) {
    if (tx.type === 'deposit') {
      addLot(
        holdingKey(tx.chain, tx.asset),
        tx.amount,
        getAcquisitionValueUsd(tx),
        tx.timestamp,
      );
      continue;
    }

    if (tx.type === 'withdraw') {
      consumeLots(holdingKey(tx.chain, tx.asset), tx.amount, tx.timestamp);
      continue;
    }

    if (tx.type === 'swap') {
      if (tx.counterAsset && tx.counterAmount) {
        const saleKey = holdingKey(tx.chain, tx.counterAsset);
        const consumed = consumeLots(saleKey, tx.counterAmount, tx.timestamp);
        const proceedsUsd = getDisposalValueUsd(tx);

        if (consumed.consumedAmount > 0) {
          realizedSalesCount += 1;
          realizedGainUsd += proceedsUsd - consumed.costBasisUsd;
          holdingPeriodWeightedDays += consumed.holdingDaysWeighted;
          holdingPeriodWeight += consumed.consumedAmount;
        }
      }

      addLot(
        holdingKey(tx.chain, tx.asset),
        tx.amount,
        getAcquisitionValueUsd(tx),
        tx.timestamp,
      );
    }
  }

  let unrealizedCostBasisUsd = 0;
  let unrealizedValueUsd = 0;

  for (const [key, lots] of lotsByAsset.entries()) {
    const currentPrice = normalizedPrices[key];
    if (typeof currentPrice !== 'number') continue;
    for (const lot of lots) {
      unrealizedCostBasisUsd += lot.amount * lot.unitCostUsd;
      unrealizedValueUsd += lot.amount * currentPrice;
    }
  }

  return {
    averageHoldingPeriodDays: holdingPeriodWeight > 0 ? holdingPeriodWeightedDays / holdingPeriodWeight : 0,
    realizedGainUsd,
    unrealizedCostBasisUsd,
    unrealizedValueUsd,
    unrealizedGainUsd: unrealizedValueUsd - unrealizedCostBasisUsd,
    realizedSalesCount,
  };
}

export function calculateChainAttribution(
  history: HistoryPoint[],
  endDistribution: Record<Chain, number>,
): ChainAttributionRow[] {
  const sorted = sortHistory(history);
  if (sorted.length === 0) {
    return (Object.entries(endDistribution) as Array<[Chain, number]>)
      .filter(([, value]) => value > 0)
      .map(([chain, value]) => ({
        chain,
        moveUsd: 0,
        startValueUsd: value,
        endValueUsd: value,
      }));
  }

  const moveByChain: Record<Chain, number> = {
    pulsechain: 0,
    ethereum: 0,
    base: 0,
  };

  for (const point of sorted) {
    if (!point.chainPnl) continue;
    for (const chain of Object.keys(moveByChain) as Chain[]) {
      moveByChain[chain] += point.chainPnl[chain] ?? 0;
    }
  }

  return (Object.entries(endDistribution) as Array<[Chain, number]>)
    .filter(([, endValueUsd]) => endValueUsd > 0)
    .map(([chain, endValueUsd]) => {
      const moveUsd = moveByChain[chain];
      return {
        chain,
        moveUsd,
        startValueUsd: Math.max(0, endValueUsd - moveUsd),
        endValueUsd,
      };
    })
    .sort((a, b) => b.endValueUsd - a.endValueUsd);
}
