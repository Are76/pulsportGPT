import { describe, expect, it } from 'vitest';
import { calculatePortfolioSummary } from '../features/portfolio/usePortfolioSummaryController';
import type { Asset, HexStake, Transaction, Wallet } from '../types';

describe('calculatePortfolioSummary', () => {
  it('derives liquid value, staking value, net investment, and realized pnl', () => {
    const assets: Asset[] = [
      {
        id: 'pls',
        symbol: 'PLS',
        name: 'PulseChain',
        balance: 1000,
        price: 0.001,
        value: 1,
        chain: 'pulsechain',
        pnl24h: 10,
      },
      {
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        balance: 1,
        price: 3000,
        value: 3000,
        chain: 'ethereum',
        pnl24h: 5,
      },
      {
        id: 'hex',
        symbol: 'HEX',
        name: 'HEX',
        balance: 100,
        price: 2,
        value: 200,
        chain: 'pulsechain',
      },
    ];

    const stakes: HexStake[] = [
      {
        id: 'stake-1',
        stakeId: 1,
        stakedHearts: 100000000n,
        stakeShares: 1000000000000n,
        lockedDay: 100,
        stakedDays: 10,
        unlockedDay: 200,
        isAutoStake: false,
        progress: 50,
        estimatedValueUsd: 0,
        chain: 'pulsechain',
        daysRemaining: 5,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'eth-in',
        hash: '0x1',
        timestamp: Date.UTC(2026, 0, 1),
        type: 'deposit',
        from: '0xexternal',
        to: '0xwallet',
        asset: 'ETH',
        amount: 1,
        valueUsd: 3000,
        chain: 'ethereum',
      },
      {
        id: 'bridge-base',
        hash: '0x2',
        timestamp: Date.UTC(2026, 0, 2, 0, 0, 0),
        type: 'deposit',
        from: '0xbridge',
        to: '0xwallet',
        asset: 'USDC',
        amount: 1000,
        valueUsd: 1000,
        chain: 'base',
      },
      {
        id: 'bridge-pulse',
        hash: '0x3',
        timestamp: Date.UTC(2026, 0, 2, 1, 0, 0),
        type: 'deposit',
        from: '0xbridge',
        to: '0xwallet',
        asset: 'USDC',
        amount: 1000,
        valueUsd: 1000,
        chain: 'pulsechain',
      },
      {
        id: 'hex-buy',
        hash: '0x4',
        timestamp: Date.UTC(2026, 0, 3),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'HEX',
        amount: 100,
        valueUsd: 150,
        counterAsset: 'USDC',
        counterAmount: 150,
        chain: 'pulsechain',
      },
      {
        id: 'hex-sell',
        hash: '0x5',
        timestamp: Date.UTC(2026, 0, 4),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'USDC',
        amount: 200,
        valueUsd: 200,
        counterAsset: 'HEX',
        counterAmount: 100,
        chain: 'pulsechain',
      },
    ];

    const wallets: Wallet[] = [
      { address: '0xwallet', name: 'Main' },
    ];

    const summary = calculatePortfolioSummary({
      currentAssets: assets,
      currentStakes: stakes,
      currentTransactions: transactions,
      prices: {
        pulsechain: { usd: 0.001 },
        'pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': { usd: 2 },
        'pulsechain:hex': { usd: 2 },
      },
      wallets,
    });

    expect(summary.liquidValue).toBe(3201);
    expect(summary.stakingValueUsd).toBeGreaterThan(2);
    expect(summary.netInvestment).toBe(4000);
    expect(summary.realizedPnl).toBe(50);
    expect(summary.chainDistribution.ethereum).toBe(3000);
    expect(summary.chainDistribution.pulsechain).toBe(201);
    expect(summary.nativePlsBalance).toBe(1000);
  });
});
