import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { normalizeTransactions } from '../utils/normalizeTransactions';

describe('normalizeTransactions', () => {
  it('does not collapse same-asset in/out transfers into swaps', () => {
    const walletAddrs = new Set(['0xwallet']);
    const timestamp = new Date('2026-04-23T12:00:00Z').getTime();

    const txs: Transaction[] = [
      {
        id: 'inc-out',
        hash: '0xinc',
        timestamp,
        type: 'withdraw',
        from: '0xwallet',
        to: '0xother',
        asset: 'INC',
        amount: 100,
        valueUsd: 250,
        chain: 'pulsechain',
      },
      {
        id: 'inc-in',
        hash: '0xinc',
        timestamp,
        type: 'deposit',
        from: '0xrouter',
        to: '0xwallet',
        asset: 'INC',
        amount: 99.5,
        valueUsd: 248.75,
        chain: 'pulsechain',
      },
    ];

    const normalized = normalizeTransactions(txs, walletAddrs);

    expect(normalized).toHaveLength(2);
    expect(normalized.every(tx => tx.type !== 'swap')).toBe(true);
    expect(normalized.map(tx => tx.id).sort()).toEqual(['inc-in', 'inc-out']);
  });

  it('still collapses different-asset in/out pairs into swaps', () => {
    const walletAddrs = new Set(['0xwallet']);
    const timestamp = new Date('2026-04-23T12:00:00Z').getTime();

    const txs: Transaction[] = [
      {
        id: 'pls-out',
        hash: '0xswap',
        timestamp,
        type: 'withdraw',
        from: '0xwallet',
        to: '0xrouter',
        asset: 'PLS',
        amount: 1000,
        valueUsd: 82,
        chain: 'pulsechain',
      },
      {
        id: 'inc-in',
        hash: '0xswap',
        timestamp,
        type: 'deposit',
        from: '0xrouter',
        to: '0xwallet',
        asset: 'INC',
        amount: 32.1,
        valueUsd: 82,
        chain: 'pulsechain',
      },
    ];

    const normalized = normalizeTransactions(txs, walletAddrs);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      type: 'swap',
      asset: 'INC',
      counterAsset: 'PLS',
      counterAmount: 1000,
    });
  });
});
