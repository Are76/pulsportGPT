import { describe, expect, it, vi } from 'vitest';
import {
  fetchDefiLlamaPrices,
  summarizeDexScreenerPairs,
} from '../services/marketDataService';

describe('marketDataService', () => {
  it('maps DeFi Llama coin payloads into a flat key map', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coins: {
          'ethereum:0xabc': { price: 2, logo: 'logo.png' },
        },
      }),
    });

    const result = await fetchDefiLlamaPrices(['ethereum:0xabc'], fetchImpl as any);

    expect(result).toEqual({
      'ethereum:0xabc': { price: 2, logo: 'logo.png' },
    });
  });

  it('summarizes DexScreener pairs using the deepest-liquidity pair for top-level fields', () => {
    const summary = summarizeDexScreenerPairs([
      {
        liquidity: { usd: 50 },
        volume: { h24: 10 },
        txns: { h24: { buys: 2, sells: 3 } },
        priceChange: { h24: 4 },
        info: { description: 'small', imageUrl: 'small.png', websites: ['a'], socials: ['b'] },
      },
      {
        liquidity: { usd: 200 },
        volume: { h24: 40 },
        marketCap: 1000,
        fdv: 1200,
        txns: { h24: { buys: 8, sells: 7 } },
        priceNative: '0.42',
        priceChange: { h1: 1, h6: 2, h24: 3, d7: 4 },
        info: { description: 'top', imageUrl: 'top.png', websites: ['site'], socials: ['x'] },
      },
    ], 'fallback');

    expect(summary).toEqual({
      liquidity: 250,
      volume24h: 50,
      marketCap: 1000,
      fdv: 1200,
      pools: 2,
      txns24h: 20,
      nativePriceUsd: '0.42',
      priceChange1h: 1,
      priceChange6h: 2,
      priceChange24h: 3,
      priceChange7d: 4,
      description: 'top',
      websites: ['site'],
      socials: ['x'],
      imageUrl: 'top.png',
    });
  });
});

