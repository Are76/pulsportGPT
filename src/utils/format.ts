/**
 * Centralised number-formatting utilities.
 *
 * All helpers are pure functions that do not close over any React state.
 * Import from this module instead of defining local copies inside components.
 */

/** Format a large integer with space-separated thousands groups (e.g. 1 250 000). */
export function fmtBigNum(n: number): string {
  return Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
}

/** Format a decimal to a fixed number of decimal places (default 2). */
export function fmtDec(n: number, dp = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/**
 * Format a token balance:
 *   ≥ 1 000 000 → "1.23M"
 *   ≥ 1 000     → "1.23K"
 *   otherwise   → locale string with up to 4 decimal places
 */
export function fmtTok(n: number): string {
  if (n > 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n > 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/**
 * Compact number formatter (for USD totals / market-cap figures):
 *   ≥ 1B  → "1.23B"
 *   ≥ 1M  → "1.23M"
 *   ≥ 1K  → "1.2K"
 *   otherwise → integer locale string
 */
export function fmtCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Compact number formatter with K/M/B/T suffix for market-data values.
 * Returns "-" for null/undefined inputs.
 */
export function fmtMarket(v?: number | null): string {
  if (v == null) return '-';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/**
 * Format a USD price with adaptive decimal places.
 * Very small prices use more decimal places; returns "-" for zero.
 */
export function fmtPrice(p: number): string {
  if (p === 0) return '-';
  if (p < 0.00001) return `$${p.toFixed(10)}`;
  if (p < 0.001) return `$${p.toFixed(8)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Format a percentage change with sign.
 * e.g.  5.4 → "+5.40 %"   -2.1 → "-2.10 %"
 */
export function fmtPercent(n: number, dp = 2): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(dp)}%`;
}
