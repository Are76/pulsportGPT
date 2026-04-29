import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '../types';
import { enrichPulsechainMissingPrices } from '../features/portfolio/enrichPulsechainMissingPrices';

describe('enrichPulsechainMissingPrices', () => {
  it('hydrates missing PulseChain token prices and wallet rows from DexScreener', async () => {
    const assetMap: Record<string, Asset> = {
      'pulsechain-ABC': {
        id: 'pulsechain-ABC',
        symbol: 'ABC',
        name: 'ABC',
        address: '0xabc',
        balance: 2,
        price: 0,
        value: 0,
        chain: 'pulsechain',
      },
    };
    const walletAssetMap = {
      wallet: {
        'pulsechain-ABC': {
          ...assetMap['pulsechain-ABC'],
          id: 'wallet-pulsechain-ABC',
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pairs: [
          {
            chainId: 'pulsechain',
            priceUsd: '1.5',
            liquidity: { usd: 1000 },
            priceChange: { h24: 3, h1: 1 },
            baseToken: { address: '0xabc', symbol: 'ABX', name: 'Alpha' },
            quoteToken: { address: '0xdef', symbol: 'PLS', name: 'PulseChain' },
            info: { imageUrl: 'https://logo' },
          },
        ],
      }),
    });

    const logos = await enrichPulsechainMissingPrices(assetMap, walletAssetMap, fetchMock as any);

    expect(assetMap['pulsechain-ABC']).toMatchObject({
      symbol: 'ABX',
      name: 'Alpha',
      price: 1.5,
      value: 3,
      pnl24h: 3,
      priceChange1h: 1,
      logoUrl: 'https://logo',
    });
    expect(walletAssetMap.wallet['pulsechain-ABC']).toMatchObject({
      symbol: 'ABX',
      name: 'Alpha',
      price: 1.5,
      value: 3,
      logoUrl: 'https://logo',
    });
    expect(logos).toEqual({ '0xabc': 'https://logo' });
  });

  it('ignores assets without a positive DexScreener price', async () => {
    const assetMap: Record<string, Asset> = {
      x: {
        id: 'x',
        symbol: 'X',
        name: 'X',
        address: '0xabc',
        balance: 1,
        price: 0,
        value: 0,
        chain: 'pulsechain',
      },
    };
    const walletAssetMap = {};
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pairs: [{ chainId: 'pulsechain', priceUsd: '0', liquidity: { usd: 1 } }],
      }),
    });

    const logos = await enrichPulsechainMissingPrices(assetMap, walletAssetMap, fetchMock as any);

    expect(assetMap.x.price).toBe(0);
    expect(logos).toEqual({});
  });
});
