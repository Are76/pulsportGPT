import type { Chain, PriceQuote } from '../types';

interface PriceRequest {
  tokenAddress: string;
  chain: Chain;
}

interface PriceSources {
  pulseX?: Record<string, number>;
  coinGecko?: Record<string, number>;
}

function isValidPrice(price: number | undefined): price is number {
  return price !== undefined && Number.isFinite(price) && price > 0;
}

export function resolvePriceQuotes(
  requests: PriceRequest[],
  sources: PriceSources,
): PriceQuote[] {
  return requests.map(request => {
    const tokenAddress = request.tokenAddress.trim().toLowerCase();
    const pulseXPrice = sources.pulseX?.[tokenAddress];

    if (isValidPrice(pulseXPrice)) {
      return {
        tokenAddress,
        chain: request.chain,
        priceUsd: pulseXPrice,
        source: 'pulsex',
      };
    }

    const coinGeckoPrice = sources.coinGecko?.[tokenAddress];

    if (isValidPrice(coinGeckoPrice)) {
      return {
        tokenAddress,
        chain: request.chain,
        priceUsd: coinGeckoPrice,
        source: 'coingecko',
      };
    }

    return {
      tokenAddress,
      chain: request.chain,
      priceUsd: null,
      source: 'unpriced',
    };
  });
}
