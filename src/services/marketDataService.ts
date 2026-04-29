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

function getBlockscoutApiBase(chain: Extract<Chain, 'pulsechain' | 'base'>): string {
  return chain === 'base' ? 'https://base.blockscout.com/api/v2' : 'https://scan.pulsechain.com/api/v2';
}

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

export async function fetchBlockscoutTokenDetails(
  chain: Extract<Chain, 'pulsechain' | 'base'>,
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<any | null> {
  const response = await fetchImpl(`${getBlockscoutApiBase(chain)}/tokens/${address}`);
  if (!response.ok) return null;
  return response.json();
}

export async function fetchDexScreenerTokenPairs(
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<any[]> {
  const response = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.pairs) ? data.pairs : [];
}

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

export async function fetchDexScreenerSummary(
  address: string,
  fallbackDescription: string | null = null,
  fetchImpl: FetchLike = fetch,
): Promise<DexScreenerSummary | null> {
  const pairs = await fetchDexScreenerTokenPairs(address, fetchImpl);
  return summarizeDexScreenerPairs(pairs, fallbackDescription);
}
