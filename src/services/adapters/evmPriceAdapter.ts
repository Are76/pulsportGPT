import { TOKENS } from '../../constants';
import type { Chain, PriceQuote } from '../../types';
import { fetchDefiLlamaPrices } from '../marketDataService';
import { resolvePriceQuotes } from '../priceService';
import { FETCH_TIMEOUT } from './rpcUtils';

type FetchLike = typeof fetch;

async function fetchCoinGeckoPriceMap(
  coinGeckoIds: string[],
  fetchImpl: FetchLike,
): Promise<Record<string, number>> {
  if (coinGeckoIds.length === 0) {
    return {};
  }

  const response = await fetchImpl(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoIds.join(',')}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
  );

  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }

  const json = await response.json() as Record<string, { usd?: number }>;

  return Object.entries(json).reduce<Record<string, number>>((acc, [coinGeckoId, value]) => {
    if (typeof value?.usd === 'number' && Number.isFinite(value.usd) && value.usd > 0) {
      acc[coinGeckoId] = value.usd;
    }
    return acc;
  }, {});
}

/**
 * Produces USD price quotes for the specified EVM token addresses on the given chain using DeFiLlama-sourced prices.
 *
 * Resolves prices by looking up DeFiLlama price entries keyed by token address and returns PriceQuote objects only for tokens with a finite USD price greater than 0.
 *
 * @param tokenAddresses - Array of token contract addresses to price (entries may include whitespace or mixed case)
 * @param chain - The target chain ('ethereum' or 'base') for which prices should be resolved
 * @param fetchImpl - Optional fetch implementation to use for network requests
 * @returns An array of PriceQuote objects for the provided addresses; only tokens with a positive finite USD price are included
 */
export async function getEvmPrices(
  tokenAddresses: string[],
  chain: Extract<Chain, 'ethereum' | 'base'>,
  fetchImpl: FetchLike = fetch,
): Promise<PriceQuote[]> {
  const requests = tokenAddresses.map((tokenAddress) => ({
    tokenAddress: tokenAddress.trim().toLowerCase(),
    chain,
  }));

  if (requests.length === 0) {
    return [];
  }

  const knownTokens = TOKENS[chain].filter((token) =>
    requests.some((request) => request.tokenAddress === token.address.toLowerCase()),
  );

  const llamaKeys = [...new Set(knownTokens.map((token) => getDefiLlamaKey(chain, token.address.toLowerCase())))];
  const llamaPriceMap = await fetchDefiLlamaPrices(llamaKeys, fetchImpl).catch<Record<string, { price: number }>>(() => ({}));

  const coinGeckoByAddress = knownTokens.reduce<Record<string, number>>((acc, token) => {
    const price = llamaPriceMap[getDefiLlamaKey(chain, token.address.toLowerCase())]?.price;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      acc[token.address.toLowerCase()] = price;
    }
    return acc;
  }, {});

  return resolvePriceQuotes(requests, {
    coinGecko: coinGeckoByAddress,
  });
}
