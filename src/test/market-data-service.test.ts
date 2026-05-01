import { describe, expect, it, vi } from 'vitest';
import {
  fetchBlockscoutTokenDetails,
  fetchDefiLlamaPrices,
  fetchDexScreenerBatchTokenPairs,
  fetchDexScreenerSummary,
  fetchDexScreenerTokenPairs,
  summarizeDexScreenerPairs,
} from '../services/marketDataService';

describe('marketDataService', () => {
  describe('fetchDefiLlamaPrices', () => {
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

    it('returns empty object when keys array is empty without making any request', async () => {
      const fetchImpl = vi.fn();
      const result = await fetchDefiLlamaPrices([], fetchImpl as any);
      expect(result).toEqual({});
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('returns empty object when the HTTP response is not ok', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const result = await fetchDefiLlamaPrices(['ethereum:0xfail'], fetchImpl as any);
      expect(result).toEqual({});
    });

    it('returns empty object when response.coins is missing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      const result = await fetchDefiLlamaPrices(['ethereum:0xabc'], fetchImpl as any);
      expect(result).toEqual({});
    });

    it('joins multiple keys with commas in the request URL', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ coins: {} }),
      });
      await fetchDefiLlamaPrices(['ethereum:0xaaa', 'ethereum:0xbbb'], fetchImpl as any);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://coins.llama.fi/prices/current/ethereum:0xaaa,ethereum:0xbbb',
      );
    });
  });

  describe('fetchBlockscoutTokenDetails', () => {
    it('returns parsed JSON for a valid pulsechain token request', async () => {
      const tokenData = { symbol: 'HEX', exchange_rate: '0.0014' };
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => tokenData,
      });

      const result = await fetchBlockscoutTokenDetails('pulsechain', '0xhex', fetchImpl as any);

      expect(result).toEqual(tokenData);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://scan.pulsechain.com/api/v2/tokens/0xhex',
      );
    });

    it('uses the base blockscout URL for base chain requests', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ symbol: 'USDC' }),
      });

      await fetchBlockscoutTokenDetails('base', '0xusdc', fetchImpl as any);

      expect(fetchImpl).toHaveBeenCalledWith(
        'https://base.blockscout.com/api/v2/tokens/0xusdc',
      );
    });

    it('returns null when the HTTP response is not ok', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      const result = await fetchBlockscoutTokenDetails('pulsechain', '0xbad', fetchImpl as any);
      expect(result).toBeNull();
    });
  });

  describe('fetchDexScreenerTokenPairs', () => {
    it('returns an array of pairs from a successful DexScreener response', async () => {
      const pairs = [{ pairAddress: '0xpair', liquidity: { usd: 1000 } }];
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pairs }),
      });

      const result = await fetchDexScreenerTokenPairs('0xtoken', fetchImpl as any);

      expect(result).toEqual(pairs);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.dexscreener.com/latest/dex/tokens/0xtoken',
      );
    });

    it('returns empty array when HTTP response is not ok', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
      const result = await fetchDexScreenerTokenPairs('0xtoken', fetchImpl as any);
      expect(result).toEqual([]);
    });

    it('returns empty array when pairs field is not an array', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pairs: null }),
      });
      const result = await fetchDexScreenerTokenPairs('0xtoken', fetchImpl as any);
      expect(result).toEqual([]);
    });

    it('returns empty array when pairs field is missing entirely', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      const result = await fetchDexScreenerTokenPairs('0xtoken', fetchImpl as any);
      expect(result).toEqual([]);
    });
  });

  describe('fetchDexScreenerBatchTokenPairs', () => {
    it('returns empty array without making a request when addresses is empty', async () => {
      const fetchImpl = vi.fn();
      const result = await fetchDexScreenerBatchTokenPairs('pulsechain', [], fetchImpl as any);
      expect(result).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('joins multiple addresses with commas in the request URL', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });
      await fetchDexScreenerBatchTokenPairs('pulsechain', ['0xaaa', '0xbbb'], fetchImpl as any);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.dexscreener.com/tokens/v1/pulsechain/0xaaa,0xbbb',
      );
    });

    it('returns parsed array from a successful batch response', async () => {
      const pairs = [{ baseToken: { address: '0xaaa' }, priceUsd: '1.5' }];
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => pairs,
      });
      const result = await fetchDexScreenerBatchTokenPairs('pulsechain', ['0xaaa'], fetchImpl as any);
      expect(result).toEqual(pairs);
    });

    it('returns empty array when HTTP response is not ok', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
      const result = await fetchDexScreenerBatchTokenPairs('pulsechain', ['0xaaa'], fetchImpl as any);
      expect(result).toEqual([]);
    });

    it('returns empty array when response body is not an array', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pairs: [] }),
      });
      const result = await fetchDexScreenerBatchTokenPairs('pulsechain', ['0xaaa'], fetchImpl as any);
      expect(result).toEqual([]);
    });
  });

  describe('summarizeDexScreenerPairs', () => {
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

    it('returns null for an empty pairs array', () => {
      expect(summarizeDexScreenerPairs([])).toBeNull();
    });

    it('returns null for non-array input', () => {
      expect(summarizeDexScreenerPairs(null as any)).toBeNull();
      expect(summarizeDexScreenerPairs(undefined as any)).toBeNull();
    });

    it('uses the fallback description when the top pair has no description', () => {
      const summary = summarizeDexScreenerPairs(
        [{ liquidity: { usd: 100 }, info: {} }],
        'My fallback',
      );
      expect(summary?.description).toBe('My fallback');
    });

    it('prefers top pair description over fallback description', () => {
      const summary = summarizeDexScreenerPairs(
        [{ liquidity: { usd: 100 }, info: { description: 'Real description' } }],
        'Fallback',
      );
      expect(summary?.description).toBe('Real description');
    });

    it('handles pairs with missing optional fields gracefully', () => {
      const summary = summarizeDexScreenerPairs([{}]);
      expect(summary).not.toBeNull();
      expect(summary?.liquidity).toBe(0);
      expect(summary?.volume24h).toBe(0);
      expect(summary?.marketCap).toBeNull();
      expect(summary?.fdv).toBeNull();
      expect(summary?.pools).toBe(1);
      expect(summary?.txns24h).toBe(0);
      expect(summary?.nativePriceUsd).toBeNull();
      expect(summary?.priceChange1h).toBeNull();
      expect(summary?.priceChange6h).toBeNull();
      expect(summary?.priceChange24h).toBeNull();
      expect(summary?.priceChange7d).toBeNull();
      expect(summary?.description).toBeNull();
      expect(summary?.websites).toEqual([]);
      expect(summary?.socials).toEqual([]);
      expect(summary?.imageUrl).toBeNull();
    });

    it('aggregates liquidity, volume, and txns across all pairs', () => {
      const summary = summarizeDexScreenerPairs([
        { liquidity: { usd: 100 }, volume: { h24: 50 }, txns: { h24: { buys: 3, sells: 2 } } },
        { liquidity: { usd: 200 }, volume: { h24: 75 }, txns: { h24: { buys: 7, sells: 8 } } },
        { liquidity: { usd: 150 }, volume: { h24: 25 }, txns: { h24: { buys: 1, sells: 1 } } },
      ]);
      expect(summary?.liquidity).toBe(450);
      expect(summary?.volume24h).toBe(150);
      expect(summary?.txns24h).toBe(22);
      expect(summary?.pools).toBe(3);
    });
  });

  describe('fetchDexScreenerSummary', () => {
    it('fetches pairs and returns a summary when pairs are available', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pairs: [
            {
              liquidity: { usd: 5000 },
              volume: { h24: 1000 },
              marketCap: 50000,
              fdv: 60000,
              txns: { h24: { buys: 10, sells: 8 } },
              priceNative: '0.001',
              priceChange: { h1: 0.5, h6: 1.2, h24: -2.1, d7: 5.0 },
              info: { description: 'Test token', imageUrl: 'img.png', websites: [], socials: [] },
            },
          ],
        }),
      });

      const result = await fetchDexScreenerSummary('0xtoken', 'fallback', fetchImpl as any);

      expect(result).not.toBeNull();
      expect(result?.liquidity).toBe(5000);
      expect(result?.marketCap).toBe(50000);
      expect(result?.description).toBe('Test token');
      expect(result?.imageUrl).toBe('img.png');
    });

    it('returns null when no pairs are found', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pairs: [] }),
      });
      const result = await fetchDexScreenerSummary('0xtoken', null, fetchImpl as any);
      expect(result).toBeNull();
    });

    it('returns null when the HTTP request fails', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
      const result = await fetchDexScreenerSummary('0xtoken', null, fetchImpl as any);
      expect(result).toBeNull();
    });

    it('passes the fallback description through to the summary', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pairs: [{ liquidity: { usd: 100 }, info: {} }],
        }),
      });
      const result = await fetchDexScreenerSummary('0xtoken', 'My fallback', fetchImpl as any);
      expect(result?.description).toBe('My fallback');
    });
  });
});

