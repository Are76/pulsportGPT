/**
 * buildBenchmark
 * --------------
 * Constructs a HistoryPoint[] for a 50/50 PLS+ETH benchmark starting at the
 * same value and date as the portfolio, using real daily close prices fetched
 * by fetchBenchmarkPrices.
 *
 * Replaces the fake +1.5%/point synthetic benchmark in buildWalletAnalyzerModel.
 *
 * If price data is unavailable for a day the previous day's value is carried
 * forward (last-price-carry).
 */

import type { HistoryPoint } from '../../types';
import { fetchBenchmarkPrices, type PricePoint } from './fetchBenchmarkPrices';

function findClosestPrice(series: PricePoint[], targetTs: number): number | null {
  if (series.length === 0) return null;

  let best = series[0]!;
  let bestDiff = Math.abs(best.timestamp - targetTs);

  for (const point of series) {
    const diff = Math.abs(point.timestamp - targetTs);
    if (diff < bestDiff) {
      best = point;
      bestDiff = diff;
    }
  }

  // Only accept prices within 48 hours of the target
  return bestDiff <= 48 * 60 * 60 * 1000 ? best.price : null;
}

export interface BuildBenchmarkOptions {
  /** Allocation weight for PLS (0–1). Default 0.5. */
  plsWeight?: number;
  /** Allocation weight for ETH (0–1). Default 0.5. */
  ethWeight?: number;
}

/**
 * Build a benchmark HistoryPoint[] aligned to the timestamps of `portfolioHistory`.
 *
 * The benchmark starts at the same `startingValue` as the first portfolio point
 * and tracks a `plsWeight`/`ethWeight` allocation (default 50/50).
 *
 * @param portfolioHistory - The real portfolio HistoryPoint[] to align against.
 * @param startingValue    - NAV at the first portfolio point (USD).
 * @param options          - Optional weight overrides.
 */
export async function buildBenchmark(
  portfolioHistory: HistoryPoint[],
  startingValue: number,
  options: BuildBenchmarkOptions = {},
): Promise<HistoryPoint[]> {
  if (portfolioHistory.length === 0) return [];

  const plsWeight = options.plsWeight ?? 0.5;
  const ethWeight = options.ethWeight ?? 0.5;

  const { pls, eth } = await fetchBenchmarkPrices();

  const sorted = [...portfolioHistory].sort((a, b) => a.timestamp - b.timestamp);

  // Determine start prices
  const firstTs = sorted[0]!.timestamp;
  const startPlsPrice = findClosestPrice(pls, firstTs) ?? 1;
  const startEthPrice = findClosestPrice(eth, firstTs) ?? 1;

  // Allocate units at t=0
  const plsUnits = startingValue > 0 ? (startingValue * plsWeight) / startPlsPrice : 0;
  const ethUnits = startingValue > 0 ? (startingValue * ethWeight) / startEthPrice : 0;

  let prevValue = startingValue;

  return sorted.map((point) => {
    const plsPrice = findClosestPrice(pls, point.timestamp) ?? (startPlsPrice);
    const ethPrice = findClosestPrice(eth, point.timestamp) ?? (startEthPrice);

    const value = plsUnits * plsPrice + ethUnits * ethPrice;
    const pnl = value - prevValue;
    prevValue = value;

    return {
      timestamp: point.timestamp,
      value,
      nativeValue: 0, // benchmark is in USD only
      pnl,
    };
  });
}
