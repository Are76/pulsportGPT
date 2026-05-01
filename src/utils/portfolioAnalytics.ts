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

export type PulsechainCoreRotationSymbol = 'PLS' | 'PLSX' | 'INC' | 'PRVX' | 'pHEX' | 'eHEX';

export interface PulsechainCoreRotationSwap {
  hash: string;
  timestamp: number;
  soldSymbol: PulsechainCoreRotationSymbol;
  soldAmount: number;
  boughtSymbol: PulsechainCoreRotationSymbol;
  boughtAmount: number;
  valueUsd?: number;
  soldPriceUsdAtTx?: number;
  boughtPriceUsdAtTx?: number;
}

export interface PulsechainCoreRotationPairStats {
  pair: string;
  soldSymbol: PulsechainCoreRotationSymbol;
  boughtSymbol: PulsechainCoreRotationSymbol;
  realizedPnlPls: number;
  volumePls: number;
  rotationCount: number;
}

export interface PulsechainCoreRotationPnl {
  realizedPnlPls: number;
  unrealizedCostBasisPls: number;
  unrealizedValuePls: number;
  unrealizedPnlPls: number;
  totalPnlPls: number;
  realizedRotationCount: number;
  pairStats: PulsechainCoreRotationPairStats[];
}

type Lot = {
  amount: number;
  unitCostUsd: number;
  timestamp: number;
};

type PlsLot = {
  amount: number;
  unitCostPls: number;
};

/**
 * Produce a new array of history points ordered by timestamp in ascending order.
 *
 * The input array is not mutated; a sorted shallow copy is returned.
 *
 * @param history - Array of history points to sort
 * @returns A new array of the same history points sorted by `timestamp` (earliest first)
 */
function sortHistory(history: HistoryPoint[]): HistoryPoint[] {
  return [...history].sort((a, b) => a.timestamp - b.timestamp);
}

function getReturn(startValue: number, endValue: number): number {
  if (startValue <= 0) return 0;
  return endValue / startValue - 1;
}

/**
 * Computes the population standard deviation of an array of numbers.
 *
 * @param values - The sample of numeric values to analyze
 * @returns The population standard deviation of `values`, or `0` if `values` is empty
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Build an uppercase identifier for a holding by joining chain and asset with a colon.
 *
 * @param chain - The chain identifier (e.g., 'pulsechain', 'ethereum')
 * @param asset - The asset symbol or address
 * @returns An uppercase string in the form `CHAIN:ASSET`
 */
function holdingKey(chain: string, asset: string): string {
  return `${chain}:${asset}`.toUpperCase();
}

/**
 * Map a token symbol (including common variant forms) to the canonical Pulsechain core rotation symbol.
 *
 * Accepts typical symbol variants and returns the corresponding canonical symbol when recognized.
 *
 * @param symbol - The input token symbol or variant to normalize
 * @returns One of the canonical symbols `PLS`, `PLSX`, `INC`, `PRVX`, `pHEX`, or `eHEX` if recognized, `null` otherwise
 */
function normalizePulsechainCoreRotationSymbol(symbol: string): PulsechainCoreRotationSymbol | null {
  const upper = symbol.trim().toUpperCase();
  if (upper === 'PLS' || upper === 'WPLS') return 'PLS';
  if (upper === 'PLSX') return 'PLSX';
  if (upper === 'INC') return 'INC';
  if (upper === 'PRVX') return 'PRVX';
  if (upper === 'EHEX' || upper.includes('HEX (FROM ETHEREUM)')) return 'eHEX';
  if (upper === 'HEX' || upper === 'PHEX') return 'pHEX';
  return null;
}

/**
 * Builds a lookup mapping normalized Pulsechain core symbols to their price expressed in PLS units.
 *
 * @param currentPricesUsd - Mapping of raw asset keys to their current USD prices.
 * @param currentPlsUsdPrice - Current USD price of PLS used to convert USD prices into PLS units.
 * @returns A record where keys are normalized core symbols (e.g., `PLS`, `PLSX`, `INC`, ...) and values are price in PLS (PLS itself maps to `1`).
 */
function buildCurrentPlsPriceLookup(currentPricesUsd: Record<string, number>, currentPlsUsdPrice: number): Record<string, number> {
  const lookup: Record<string, number> = {
    PLS: 1,
  };

  for (const [rawKey, usdPrice] of Object.entries(currentPricesUsd)) {
    if (typeof usdPrice !== 'number' || usdPrice <= 0 || currentPlsUsdPrice <= 0) continue;
    const key = rawKey.trim().toUpperCase();
    const directSymbol = normalizePulsechainCoreRotationSymbol(key);
    if (directSymbol) {
      lookup[directSymbol] = directSymbol === 'PLS' ? 1 : usdPrice / currentPlsUsdPrice;
      continue;
    }

    if (key === 'PULSECHAIN' || key === 'PULSECHAIN:NATIVE') {
      lookup.PLS = 1;
      continue;
    }

    if (key.startsWith('PULSECHAIN:')) {
      const symbol = normalizePulsechainCoreRotationSymbol(key.slice('PULSECHAIN:'.length));
      if (symbol) {
        lookup[symbol] = symbol === 'PLS' ? 1 : usdPrice / currentPlsUsdPrice;
      }
    }
  }

  return lookup;
}

/**
 * Convert a swap leg's quantity or USD value into PLS-denominated units using available pricing.
 *
 * @param symbol - The normalized core symbol for the swap leg (e.g., `PLS`, `PLSX`).
 * @param amount - The quantity of `symbol` involved in the leg.
 * @param directPriceUsd - Optional per-unit USD price for the symbol at the swap; used first when positive.
 * @param fallbackValueUsd - Optional total USD value for the leg; used when `directPriceUsd` is unavailable.
 * @param plsUsdAtTimestamp - USD price of PLS at the reference timestamp used to convert USD → PLS; conversion requires a positive value.
 * @returns The equivalent value expressed in PLS units, or `0` if the amount is non-positive or conversion cannot be performed.
 */
function resolvePlsValueFromSwapLeg(
  symbol: PulsechainCoreRotationSymbol,
  amount: number,
  directPriceUsd: number | undefined,
  fallbackValueUsd: number | undefined,
  plsUsdAtTimestamp: number,
): number {
  if (amount <= 0) return 0;
  if (symbol === 'PLS') return amount;
  if (typeof directPriceUsd === 'number' && directPriceUsd > 0 && plsUsdAtTimestamp > 0) {
    return (amount * directPriceUsd) / plsUsdAtTimestamp;
  }
  if (typeof fallbackValueUsd === 'number' && fallbackValueUsd > 0 && plsUsdAtTimestamp > 0) {
    return fallbackValueUsd / plsUsdAtTimestamp;
  }
  return 0;
}

/**
 * Compute the USD acquisition value for a transaction.
 *
 * Uses `tx.valueUsd` when present; otherwise computes `tx.assetPriceUsdAtTx * tx.amount` if both fields are numeric; returns `0` if neither is available.
 *
 * @param tx - The transaction whose acquisition value should be determined
 * @returns The acquisition value in USD
 */
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

/**
 * Compute realized and unrealized holding statistics from a chronological list of transactions.
 *
 * Processes transactions in ascending timestamp order using FIFO cost basis to calculate realized gains,
 * average holding period (in days) for realized sales, unrealized cost basis and market value using provided current prices,
 * and the count of realized sales.
 *
 * @param transactions - Transaction records to analyze (must include timestamps, types, amounts, assets, chain and pricing fields used for acquisition/disposal)
 * @param currentPrices - Current market prices keyed by asset string (lookup is case-insensitive)
 * @param nowTimestamp - Optional reference timestamp (milliseconds); accepted but not required by the calculation
 * @returns An object containing:
 *   - `averageHoldingPeriodDays`: consumption-weighted average holding period for realized sales, in days
 *   - `realizedGainUsd`: total realized gain in USD
 *   - `unrealizedCostBasisUsd`: total cost basis of remaining lots in USD
 *   - `unrealizedValueUsd`: current market value of remaining lots in USD (using `currentPrices`)
 *   - `unrealizedGainUsd`: `unrealizedValueUsd - unrealizedCostBasisUsd`
 *   - `realizedSalesCount`: number of sales that realized gains (count of disposals that consumed lots)
 */
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

/**
 * Computes per-chain attribution rows using historical chain PnL and a final distribution.
 *
 * @param history - Chronological portfolio history points; chain-level PnL from these points is aggregated to compute net moves per chain.
 * @param endDistribution - Mapping of chain keys to their ending USD values used as the reported endValueUsd for each row.
 * @returns An array of attribution rows for chains with a positive ending value, each containing:
 *          - `chain`: the chain key,
 *          - `moveUsd`: aggregated net PnL/movement for that chain,
 *          - `startValueUsd`: computed starting value (max of 0 and endValueUsd - moveUsd),
 *          - `endValueUsd`: the provided ending value; rows are sorted by descending `endValueUsd`.
 */
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

/**
 * Extracts Pulsechain core-rotation swap legs from a list of transactions.
 *
 * Filters the input for Pulsechain swap transactions and returns normalized swap records
 * where both the sold and bought symbols are recognized core symbols and differ from each other.
 *
 * @param transactions - The transactions to scan for Pulsechain swap events.
 * @returns An array of `PulsechainCoreRotationSwap` entries (sorted by ascending timestamp) representing normalized swap legs between supported core symbols.
 */
export function extractPulsechainCoreRotationSwaps(transactions: Transaction[]): PulsechainCoreRotationSwap[] {
  return [...transactions]
    .filter(
      (tx) =>
        tx.chain === 'pulsechain' &&
        tx.type === 'swap' &&
        typeof tx.counterAsset === 'string' &&
        typeof tx.counterAmount === 'number',
    )
    .map((tx): PulsechainCoreRotationSwap | null => {
      const soldSymbol = normalizePulsechainCoreRotationSymbol(tx.counterAsset!);
      const boughtSymbol = normalizePulsechainCoreRotationSymbol(tx.asset);

      if (!soldSymbol || !boughtSymbol || soldSymbol === boughtSymbol) return null;

      return {
        hash: tx.hash,
        timestamp: tx.timestamp,
        soldSymbol,
        soldAmount: tx.counterAmount!,
        boughtSymbol,
        boughtAmount: tx.amount,
        valueUsd: tx.valueUsd,
        soldPriceUsdAtTx: tx.counterPriceUsdAtTx,
        boughtPriceUsdAtTx: tx.assetPriceUsdAtTx,
      };
    })
    .filter((swap): swap is PulsechainCoreRotationSwap => swap !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Compute realized and unrealized PnL expressed in PLS and per-pair rotation aggregates from a sequence of Pulsechain core rotation swaps.
 *
 * Processes rotations in FIFO order (lots tracked in PLS units), converts historical USD values to PLS via the provided resolver, and values remaining lots using current prices converted to PLS.
 *
 * @param rotations - Rotation swap legs to process; order is used as the chronological processing order.
 * @param currentPricesUsd - Mapping of symbol keys to their current USD prices used to derive current symbol-to-PLS prices.
 * @param currentPlsUsdPrice - Current PLS price in USD used to convert `currentPricesUsd` values into PLS.
 * @param resolvePlsUsdAtTimestamp - Function that returns the PLS price in USD at a given timestamp for converting historical USD amounts into PLS.
 * @returns An object containing:
 *  - `realizedPnlPls`: total realized PnL expressed in PLS,
 *  - `unrealizedCostBasisPls`: sum of remaining lots' cost bases in PLS,
 *  - `unrealizedValuePls`: current market value of remaining lots in PLS,
 *  - `unrealizedPnlPls`: `unrealizedValuePls - unrealizedCostBasisPls`,
 *  - `totalPnlPls`: `realizedPnlPls + unrealizedPnlPls`,
 *  - `realizedRotationCount`: number of rotations that realized PnL,
 *  - `pairStats`: array of per-pair aggregates (each with `pair`, `soldSymbol`, `boughtSymbol`, `realizedPnlPls`, `volumePls`, `rotationCount`) sorted by `realizedPnlPls` descending.
 */
export function calculatePulsechainCoreRotationPnlPls(
  rotations: PulsechainCoreRotationSwap[],
  currentPricesUsd: Record<string, number>,
  currentPlsUsdPrice: number,
  resolvePlsUsdAtTimestamp: (timestamp: number) => number,
): PulsechainCoreRotationPnl {
  const lotsBySymbol = new Map<PulsechainCoreRotationSymbol, PlsLot[]>();
  const pairStats = new Map<string, PulsechainCoreRotationPairStats>();
  const currentPricePls = buildCurrentPlsPriceLookup(currentPricesUsd, currentPlsUsdPrice);

  let realizedPnlPls = 0;
  let realizedRotationCount = 0;

  const getLots = (symbol: PulsechainCoreRotationSymbol): PlsLot[] => {
    const existing = lotsBySymbol.get(symbol);
    if (existing) return existing;
    const created: PlsLot[] = [];
    lotsBySymbol.set(symbol, created);
    return created;
  };

  const addLot = (symbol: PulsechainCoreRotationSymbol, amount: number, totalCostPls: number): void => {
    if (amount <= 0 || totalCostPls < 0) return;
    getLots(symbol).push({
      amount,
      unitCostPls: amount > 0 ? totalCostPls / amount : 0,
    });
  };

  const consumeLots = (symbol: PulsechainCoreRotationSymbol, amount: number): { costBasisPls: number; consumedAmount: number } => {
    const lots = getLots(symbol);
    let remaining = amount;
    let costBasisPls = 0;
    let consumedAmount = 0;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0]!;
      const takeAmount = Math.min(lot.amount, remaining);
      costBasisPls += takeAmount * lot.unitCostPls;
      consumedAmount += takeAmount;
      lot.amount -= takeAmount;
      remaining -= takeAmount;

      if (lot.amount <= 0) {
        lots.shift();
      }
    }

    return { costBasisPls, consumedAmount };
  };

  for (const rotation of rotations) {
    const plsUsdAtTimestamp = resolvePlsUsdAtTimestamp(rotation.timestamp);
    const soldValuePls = resolvePlsValueFromSwapLeg(
      rotation.soldSymbol,
      rotation.soldAmount,
      rotation.soldPriceUsdAtTx,
      rotation.valueUsd,
      plsUsdAtTimestamp,
    );
    const boughtValuePls = resolvePlsValueFromSwapLeg(
      rotation.boughtSymbol,
      rotation.boughtAmount,
      rotation.boughtPriceUsdAtTx,
      rotation.valueUsd,
      plsUsdAtTimestamp,
    );
    const referenceValuePls = soldValuePls > 0 ? soldValuePls : boughtValuePls;

    const consumed = consumeLots(rotation.soldSymbol, rotation.soldAmount);
    if (consumed.consumedAmount > 0 && referenceValuePls > 0) {
      realizedRotationCount += 1;
      realizedPnlPls += referenceValuePls - consumed.costBasisPls;
    }

    if (referenceValuePls > 0) {
      addLot(rotation.boughtSymbol, rotation.boughtAmount, referenceValuePls);
    }

    const pair = `${rotation.soldSymbol}->${rotation.boughtSymbol}`;
    const existingPair = pairStats.get(pair) ?? {
      pair,
      soldSymbol: rotation.soldSymbol,
      boughtSymbol: rotation.boughtSymbol,
      realizedPnlPls: 0,
      volumePls: 0,
      rotationCount: 0,
    };
    existingPair.rotationCount += 1;
    existingPair.volumePls += referenceValuePls;
    if (consumed.consumedAmount > 0 && referenceValuePls > 0) {
      existingPair.realizedPnlPls += referenceValuePls - consumed.costBasisPls;
    }
    pairStats.set(pair, existingPair);
  }

  let unrealizedCostBasisPls = 0;
  let unrealizedValuePls = 0;

  for (const [symbol, lots] of lotsBySymbol.entries()) {
    const pricePls = currentPricePls[symbol];
    if (typeof pricePls !== 'number' || pricePls <= 0) continue;
    for (const lot of lots) {
      unrealizedCostBasisPls += lot.amount * lot.unitCostPls;
      unrealizedValuePls += lot.amount * pricePls;
    }
  }

  return {
    realizedPnlPls,
    unrealizedCostBasisPls,
    unrealizedValuePls,
    unrealizedPnlPls: unrealizedValuePls - unrealizedCostBasisPls,
    totalPnlPls: realizedPnlPls + (unrealizedValuePls - unrealizedCostBasisPls),
    realizedRotationCount,
    pairStats: [...pairStats.values()].sort((a, b) => b.realizedPnlPls - a.realizedPnlPls),
  };
}
