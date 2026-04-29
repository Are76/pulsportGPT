import { TOKENS } from '../../constants';
import type { Chain, PriceQuote } from '../../types';
import { resolvePriceQuotes } from '../priceService';

type FetchLike = typeof fetch;

const FETCH_TIMEOUT = 10_000;

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

  const coinGeckoIds = [...new Set(knownTokens.map((token) => token.coinGeckoId))];
  const coinGeckoById = await fetchCoinGeckoPriceMap(coinGeckoIds, fetchImpl).catch<Record<string, number>>(() => ({}));

  const coinGeckoByAddress = knownTokens.reduce<Record<string, number>>((acc, token) => {
    const price = coinGeckoById[token.coinGeckoId];
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      acc[token.address.toLowerCase()] = price;
    }
    return acc;
  }, {});

  return resolvePriceQuotes(requests, {
    coinGecko: coinGeckoByAddress,
  });
}
