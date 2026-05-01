import type { Chain } from '../types';

type FetchLike = typeof fetch;

export interface DexScreenerSummary {
  liquidity: number;
  volume24h: number;
  marketCap: number | null;
  fdv: number | null;
  pools: number;
  txns24h: number;
  nativePriceUsd: string | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  description: string | null;
  websites: any[];
  socials: any[];
  imageUrl: string | null;
}

/**
 * Get the Blockscout API base URL for the specified chain.
 *
 * @param chain - Chain identifier, either `'base'` or `'pulsechain'`
 * @returns The Blockscout API base URL for the given chain
 */
function getBlockscoutApiBase(chain: Extract<Chain, 'pulsechain' | 'base'>): string {
  return chain === 'base' ? 'https://base.blockscout.com/api/v2' : 'https://scan.pulsechain.com/api/v2';
}

/**
 * Get current prices for the given DefiLlama price keys.
 *
 * @param keys - Price key strings recognized by the DefiLlama API
 * @returns An object mapping each returned price key to `{ price: number; logo?: string }`; returns an empty object if no data is available
 */
export async function fetchDefiLlamaPrices(
  keys: string[],
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, { price: number; logo?: string }>> {
  if (keys.length === 0) return {};
  const response = await fetchImpl(`https://coins.llama.fi/prices/current/${keys.join(',')}`);
  if (!response.ok) return {};
  const data = await response.json();
  return data.coins || {};
}

/**
 * Retrieve token details from Blockscout for a given chain and token address.
 *
 * @param chain - The blockchain to query (`'pulsechain'` or `'base'`)
 * @param address - The token contract address to fetch
 * @returns The parsed JSON response containing token details, or `null` if the HTTP request was not successful
 */
export async function fetchBlockscoutTokenDetails(
  chain: Extract<Chain, 'pulsechain' | 'base'>,
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<any | null> {
  const response = await fetchImpl(`${getBlockscoutApiBase(chain)}/tokens/${address}`);
  if (!response.ok) return null;
  return response.json();
}

/**
 * Fetches the latest DexScreener DEX pairs for a token contract address.
 *
 * @param address - The token contract address to query on DexScreener
 * @returns An array of pair objects returned by DexScreener; returns an empty array if the HTTP request fails or the response does not contain a `pairs` array
 */
export async function fetchDexScreenerTokenPairs(
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<any[]> {
  const response = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.pairs) ? data.pairs : [];
}

/**
 * Fetches token pair entries from DexScreener for multiple token addresses on the given chain.
 *
 * @param chain - The DexScreener chain identifier (`'pulsechain'` is supported).
 * @param addresses - Token contract addresses to query; if empty, the function returns an empty array.
 * @returns An array of parsed DexScreener pair objects; returns an empty array when no data is available or the request fails.
 */
export async function fetchDexScreenerBatchTokenPairs(
  chain: 'pulsechain',
  addresses: string[],
  fetchImpl: FetchLike = fetch,
): Promise<any[]> {
  if (addresses.length === 0) return [];

  const response = await fetchImpl(`https://api.dexscreener.com/tokens/v1/${chain}/${addresses.join(',')}`);
  if (!response.ok) return [];

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Produce a consolidated market summary for a token from DexScreener pair records.
 *
 * @param pairs - Array of DexScreener pair objects; each object may include `liquidity.usd`, `volume.h24`, `marketCap`, `fdv`, `txns.h24`, `priceNative`, `priceChange`, and `info` metadata.
 * @param fallbackDescription - Description to use when the selected top-liquidity pair has no `info.description`
 * @returns A `DexScreenerSummary` with aggregated totals (`liquidity`, `volume24h`, `pools`, `txns24h`), top-pair values (`marketCap`, `fdv`, `nativePriceUsd`, `priceChange1h/6h/24h/7d`), and metadata (`description`, `websites`, `socials`, `imageUrl`), or `null` if `pairs` is not a non-empty array.
 */
export function summarizeDexScreenerPairs(
  pairs: any[],
  fallbackDescription: string | null = null,
): DexScreenerSummary | null {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const sorted = [...pairs].sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const top = sorted[0];

  return {
    liquidity: sorted.reduce((sum: number, pair: any) => sum + (pair.liquidity?.usd || 0), 0),
    volume24h: sorted.reduce((sum: number, pair: any) => sum + (pair.volume?.h24 || 0), 0),
    marketCap: top?.marketCap || null,
    fdv: top?.fdv || null,
    pools: pairs.length,
    txns24h: sorted.reduce((sum: number, pair: any) => sum + (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0), 0),
    nativePriceUsd: top?.priceNative || null,
    priceChange1h: top?.priceChange?.h1 ?? null,
    priceChange6h: top?.priceChange?.h6 ?? null,
    priceChange24h: top?.priceChange?.h24 ?? null,
    priceChange7d: top?.priceChange?.d7 ?? null,
    description: top?.info?.description || fallbackDescription || null,
    websites: top?.info?.websites || [],
    socials: top?.info?.socials || [],
    imageUrl: top?.info?.imageUrl || null,
  };
}

/**
 * Fetches DexScreener pairs for a token address and produces an aggregated market summary.
 *
 * @param address - The token contract address to query on DexScreener
 * @param fallbackDescription - Description to use if pair metadata does not provide one
 * @returns A `DexScreenerSummary` containing aggregated liquidity, volume, price changes, pool/txn counts and metadata, or `null` if no pair data is available
 */
export async function fetchDexScreenerSummary(
  address: string,
  fallbackDescription: string | null = null,
  fetchImpl: FetchLike = fetch,
): Promise<DexScreenerSummary | null> {
  const pairs = await fetchDexScreenerTokenPairs(address, fetchImpl);
  return summarizeDexScreenerPairs(pairs, fallbackDescription);
}
