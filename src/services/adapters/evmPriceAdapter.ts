import { TOKENS } from '../../constants';
import type { Chain, PriceQuote } from '../../types';
import { fetchDefiLlamaPrices } from '../marketDataService';
import { resolvePriceQuotes } from '../priceService';

type FetchLike = typeof fetch;

function getDefiLlamaKey(chain: Extract<Chain, 'ethereum' | 'base'>, tokenAddress: string): string {
  return tokenAddress === 'native'
    ? 'coingecko:ethereum'
    : `${chain}:${tokenAddress}`;
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
