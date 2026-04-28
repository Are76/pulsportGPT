import { describe, expect, it, vi } from 'vitest';
import { loadHexStakes } from '../features/portfolio/loadHexStakes';

describe('loadHexStakes', () => {
  it('builds normalized pulsechain stake rows', async () => {
    const readContract = vi.fn()
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce(2000n)
      .mockResolvedValueOnce([123n, 100000000n, 1000000000000n, 1900n, 365n, 2265n, false]);
    const withRetry = vi.fn((fn: () => Promise<unknown>) => fn());

    const stakes = await loadHexStakes({
      address: '0x1111111111111111111111111111111111111111',
      chain: 'pulsechain',
      hexAddress: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
      walletName: 'Main',
      fetchedPrices: {
        'pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': { usd: 0.02 },
      },
      client: { readContract },
      withRetry: withRetry as any,
    });

    expect(stakes).toHaveLength(1);
    expect(stakes[0]).toMatchObject({
      stakeId: 123,
      chain: 'pulsechain',
      walletLabel: 'Main',
      walletAddress: '0x1111111111111111111111111111111111111111',
      stakedHex: 1,
      progress: 27,
    });
    expect(stakes[0].estimatedValueUsd).toBeCloseTo(0.02);
    expect(withRetry).toHaveBeenCalledTimes(3);
  });

  it('skips rejected stake list entries without failing the batch', async () => {
    const readContract = vi.fn()
      .mockResolvedValueOnce(2n)
      .mockResolvedValueOnce(100n)
      .mockRejectedValueOnce(new Error('bad index'))
      .mockResolvedValueOnce([2n, 200000000n, 2000000000000n, 90n, 30n, 120n, true]);

    const stakes = await loadHexStakes({
      address: '0x1111111111111111111111111111111111111111',
      chain: 'ethereum',
      hexAddress: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
      walletName: 'Eth',
      fetchedPrices: { hex: { usd: 0.01 } },
      client: { readContract },
      withRetry: (fn: () => Promise<unknown>) => fn() as any,
    });

    expect(stakes).toHaveLength(1);
    expect(stakes[0]).toMatchObject({
      stakeId: 2,
      chain: 'ethereum',
      isAutoStake: true,
    });
  });
});
