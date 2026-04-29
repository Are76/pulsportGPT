/**
 * portfolioHistoryEngine
 * ----------------------
 * Reconstructs a HistoryPoint[] time series covering up to 365 days without
 * requiring the user to keep the app open.
 *
 * Strategy:
 *   1. Use API snapshots from /api/v1/portfolio/:address/history where
 *      available (fine-grained, server-stored).
 *   2. For any day with no snapshot, estimate the portfolio value by replaying
 *      transactions forward from the nearest known anchor point.
 *   3. Return a sorted, de-duplicated HistoryPoint[] spanning the requested
 *      number of days.
 *
 * The transaction-replay estimate is intentionally coarse (daily net-flow
 * buckets with the current price applied to deposits/withdraws) — it is only
 * used to fill gaps, not replace real snapshot data.
 */

import { fetchPortfolioHistory } from '../../services/apiClient';
import type { Chain, HistoryPoint, Transaction } from '../../types';

// ---------------------------------------------------------------------------
// Daily net-flow bucket
// ---------------------------------------------------------------------------

interface DailyFlowBucket {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Net USD flow into the portfolio on this day (deposits - withdraws) */
  netFlowUsd: number;
  chainFlows: Record<Chain, number>;
}

function toDateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function buildFlowBuckets(transactions: Transaction[]): Map<string, DailyFlowBucket> {
  const buckets = new Map<string, DailyFlowBucket>();

  const getOrCreate = (date: string): DailyFlowBucket => {
    if (!buckets.has(date)) {
      buckets.set(date, {
        date,
        netFlowUsd: 0,
        chainFlows: { pulsechain: 0, ethereum: 0, base: 0 },
      });
    }
    return buckets.get(date)!;
  };

  for (const tx of transactions) {
    // Skip internal transfers — they don't change aggregate portfolio value
    if (tx.type === 'internal-transfer') continue;

    const date = toDateStr(tx.timestamp);
    const bucket = getOrCreate(date);
    const usd = tx.valueUsd ?? 0;

    if (tx.type === 'deposit') {
      bucket.netFlowUsd += usd;
      bucket.chainFlows[tx.chain] += usd;
    } else if (tx.type === 'withdraw') {
      bucket.netFlowUsd -= usd;
      bucket.chainFlows[tx.chain] -= usd;
    }
    // swaps net to zero — they don't change aggregate USD value
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Gap filler
// ---------------------------------------------------------------------------

/**
 * Fill gaps in the snapshot timeline by propagating the last known value
 * forward and adjusting for daily net flows.
 */
function fillGaps(
  snapshots: HistoryPoint[],
  flowBuckets: Map<string, DailyFlowBucket>,
  days: number,
): HistoryPoint[] {
  if (snapshots.length === 0) return [];

  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);

  // Build a map of existing snapshots by date
  const byDate = new Map<string, HistoryPoint>();
  for (const snap of sorted) {
    byDate.set(toDateStr(snap.timestamp), snap);
  }

  const now = Date.now();
  const startTs = now - days * 86_400_000;
  const result: HistoryPoint[] = [];

  let prevValue = sorted[0]!.value;
  let prevNative = sorted[0]!.nativeValue;

  // Walk day by day from startTs to now
  const startDate = new Date(startTs);
  startDate.setUTCHours(0, 0, 0, 0);

  const cursor = new Date(startDate);
  while (cursor.getTime() <= now) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const snap = byDate.get(dateStr);

    if (snap) {
      prevValue = snap.value;
      prevNative = snap.nativeValue;
      result.push(snap);
    } else {
      // Estimate: carry forward + net flow
      const bucket = flowBuckets.get(dateStr);
      const estimatedValue = Math.max(0, prevValue + (bucket?.netFlowUsd ?? 0));
      const estimatedNative = prevNative; // native value is harder to estimate without price
      const point: HistoryPoint = {
        timestamp: cursor.getTime(),
        value: estimatedValue,
        nativeValue: estimatedNative,
        pnl: estimatedValue - prevValue,
      };
      result.push(point);
      prevValue = estimatedValue;
      prevNative = estimatedNative;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildPortfolioHistoryOptions {
  /** Number of days of history to reconstruct (default 30, max 365). */
  days?: number;
  /** All known transactions across all wallets (used for gap-filling). */
  transactions?: Transaction[];
}

/**
 * Build a HistoryPoint[] for `address` covering up to `days` days.
 *
 * - Fetches real snapshots from the API backend first.
 * - Falls back to transaction-replay gap-filling for missing days.
 * - Returns an empty array if no data is available at all.
 */
export async function buildPortfolioHistory(
  address: string,
  options: BuildPortfolioHistoryOptions = {},
): Promise<HistoryPoint[]> {
  const days = Math.min(365, Math.max(1, options.days ?? 30));
  const transactions = options.transactions ?? [];

  const apiPoints = await fetchPortfolioHistory(address, days);

  const snapshots: HistoryPoint[] = (apiPoints ?? []).map(pt => ({
    timestamp: pt.timestamp,
    value: pt.totalUsd,
    nativeValue: pt.nativeUsd,
    pnl: pt.pnl24hUsd ?? 0,
  }));

  if (snapshots.length === 0 && transactions.length === 0) {
    return [];
  }

  const flowBuckets = buildFlowBuckets(transactions);
  return fillGaps(snapshots, flowBuckets, days);
}
