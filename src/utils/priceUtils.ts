/**
 * Typed price-entry interface and canonical key resolution helpers.
 *
 * The canonical key format for all tokens is: `"${chain}:${addressLower}"`.
 * Native assets use the special address `"native"`.
 *
 * Using a single key scheme eliminates the need for multi-step fallback lookups
 * scattered across the codebase. Call `resolvePrice` everywhere instead.
 */

import type { Chain } from '../types';

export interface PriceEntry {
  usd: number;
  usd_24h_change?: number;
  usd_1h_change?: number;
  usd_7d_change?: number;
  image?: string;
}

export type PriceMap = Record<string, PriceEntry | undefined>;

/** Canonical key for a token by chain + address. */
export function priceKey(chain: Chain | string, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

/** Canonical key for the native gas token on a chain. */
export function nativePriceKey(chain: Chain | string): string {
  return `${chain}:native`;
}

/**
 * Resolve the price entry for a token from the price map.
 *
 * Falls back through canonical key → CoinGecko ID → raw address in that order
 * so existing cached entries continue to work while the codebase migrates.
 */
export function resolvePrice(
  prices: PriceMap,
  chain: Chain | string,
  address: string,
  coinGeckoId?: string,
): PriceEntry | undefined {
  const canonical = priceKey(chain, address);
  if (prices[canonical]) return prices[canonical];

  if (coinGeckoId && prices[coinGeckoId]) return prices[coinGeckoId];

  const raw = address.toLowerCase();
  if (prices[raw]) return prices[raw];

  return undefined;
}
