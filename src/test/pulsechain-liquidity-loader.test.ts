import { describe, expect, it, vi } from 'vitest';
import { loadPulsechainFarmPositions, loadPulsechainLpPositions } from '../features/portfolio/loadPulsechainLiquidity';

describe('loadPulsechainLiquidity', () => {
  it('builds LP positions from batched reserve and balance calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [
        { id: 0, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 1, result: `0x${(1000n).toString(16)}` },
        { id: 2, result: `0x${(100000000000000000000n).toString(16)}` },
        { id: 3, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 4, result: `0x${(1n).toString(16)}` },
        { id: 5, result: '0x0' },
        { id: 6, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 7, result: `0x${(1n).toString(16)}` },
        { id: 8, result: '0x0' },
        { id: 9, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 10, result: `0x${(1n).toString(16)}` },
        { id: 11, result: '0x0' },
        { id: 12, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 13, result: `0x${(1n).toString(16)}` },
        { id: 14, result: '0x0' },
        { id: 15, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 16, result: `0x${(1n).toString(16)}` },
        { id: 17, result: '0x0' },
        { id: 18, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 19, result: `0x${(1n).toString(16)}` },
        { id: 20, result: '0x0' },
        { id: 21, result: `0x${'0'.repeat(63)}a${'0'.repeat(63)}a${'0'.repeat(64)}` },
        { id: 22, result: `0x${(1n).toString(16)}` },
        { id: 23, result: '0x0' },
      ],
    });

    const positions = await loadPulsechainLpPositions(
      'https://rpc',
      ['0xabc'],
      {
        pulsechain: { usd: 1 },
        'pulsechain:0x95b303987a60c71504d99aa1b13b4da07b0790ab': { usd: 1 },
        'pulsechain:0xa1077a294dde1b09bb078844df40758a5d0f9a27': { usd: 1 },
      },
      fetchMock as any,
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      pairName: 'PLSX/WPLS',
      lpBalance: 100,
    });
  });

  it('builds farm positions from pool, user, and pending batches', async () => {
    const poolAddress = '1b45b9148791d3a104184cd5dfe5ce57193a3ee9';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ result: '0x1' }),
      })
      .mockResolvedValueOnce({
        json: async () => [
          { id: 0, result: `0x${'0'.repeat(24)}${poolAddress}${'0'.repeat(128 - 40)}` },
          { id: 1, result: `0x${(100000000000000000000n).toString(16).padStart(64, '0')}` },
          { id: 2, result: `0x${(5000000000000000000n).toString(16).padStart(64, '0')}` },
        ],
      });

    const positions = await loadPulsechainFarmPositions(
      'https://rpc',
      ['0xabc'],
      {
        pulsechain: { usd: 1 },
        'pulsechain:0x95b303987a60c71504d99aa1b13b4da07b0790ab': { usd: 2 },
        'pulsechain:0xa1077a294dde1b09bb078844df40758a5d0f9a27': { usd: 1 },
        'pulsechain:0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': { usd: 4 },
      },
      fetchMock as any,
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      pairName: 'PLSX/WPLS',
      stakedLp: 100,
      pendingInc: 5,
      pendingIncUsd: 20,
    });
  });
});
