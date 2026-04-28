import { describe, expect, it } from 'vitest';
import { buildPortfolioSnapshot } from '../features/portfolio/buildPortfolioSnapshot';
import type { Asset, HexStake, Transaction, Wallet } from '../types';

describe('buildPortfolioSnapshot', () => {
  it('aggregates active stakes, merges WPLS into PLS, and builds history', () => {
    const assetMap: Record<string, Asset> = {
      'pulsechain-PLS': {
        id: 'pulsechain-PLS',
        symbol: 'PLS',
        name: 'PulseChain',
        balance: 100,
        price: 1,
        value: 100,
        chain: 'pulsechain',
      },
      'pulsechain-WPLS': {
        id: 'pulsechain-WPLS',
        symbol: 'WPLS',
        name: 'Wrapped PulseChain',
        balance: 50,
        price: 1,
        value: 50,
        chain: 'pulsechain',
      },
      'pulsechain-HEX': {
        id: 'pulsechain-HEX',
        symbol: 'HEX',
        name: 'HEX',
        balance: 10,
        price: 2,
        value: 20,
        chain: 'pulsechain',
      },
    };
    const walletAssetMap = {
      '0xwallet': {
        'pulsechain-PLS': { ...assetMap['pulsechain-PLS'], id: '0xwallet-pulsechain-PLS' },
      },
    };
    const allStakes: HexStake[] = [{
      id: 'stake-1',
      stakeId: 1,
      stakedHearts: 100000000n,
      stakeShares: 0n,
      lockedDay: 0,
      stakedDays: 10,
      unlockedDay: 10,
      isAutoStake: false,
      progress: 50,
      estimatedValueUsd: 2,
      totalValueUsd: 3,
      interestHearts: 50000000n,
      chain: 'pulsechain',
      walletAddress: '0xwallet',
      daysRemaining: 5,
    }];
    const allTransactions: Transaction[] = [{
      id: 'tx-1',
      hash: '0xhash',
      timestamp: 1,
      type: 'deposit',
      from: '0xa',
      to: '0xwallet',
      asset: 'PLS',
      amount: 1,
      chain: 'pulsechain',
    }];
    const wallets: Wallet[] = [{ address: '0xwallet', name: 'Main' }];

    const snapshot = buildPortfolioSnapshot({
      assetMap,
      walletAssetMap,
      allStakes,
      allTransactions,
      fetchedPrices: { pulsechain: { usd: 1 } },
      wallets,
      previousHistory: [{ timestamp: 0, value: 100, nativeValue: 100, pnl: 0, chainPnl: { pulsechain: 0, ethereum: 0, base: 0 } }],
      previousRealStakes: [],
      now: 123,
    });

    const pls = snapshot.realAssets.find((asset) => asset.id === 'pulsechain-PLS');
    const hex = snapshot.realAssets.find((asset) => asset.id === 'pulsechain-HEX');

    expect(pls?.balance).toBe(150);
    expect(pls?.value).toBe(150);
    expect(snapshot.realAssets.some((asset) => asset.id === 'pulsechain-WPLS')).toBe(false);
    expect(hex?.stakedBalance).toBe(1.5);
    expect(hex?.stakedValue).toBe(3);
    expect(snapshot.processedTransactions).toHaveLength(1);
    expect(snapshot.history.at(-1)).toMatchObject({
      timestamp: 123,
      value: 170,
      nativeValue: 170,
      pnl: 70,
    });
  });

  it('keeps cached stakes for current wallets when no fresh stakes are returned', () => {
    const previousRealStakes: HexStake[] = [{
      id: 'stake-1',
      stakeId: 1,
      stakedHearts: 0n,
      stakeShares: 0n,
      lockedDay: 0,
      stakedDays: 0,
      unlockedDay: 0,
      isAutoStake: false,
      progress: 0,
      estimatedValueUsd: 0,
      chain: 'ethereum',
      walletAddress: '0xwallet',
    }];

    const snapshot = buildPortfolioSnapshot({
      assetMap: {},
      walletAssetMap: {},
      allStakes: [],
      allTransactions: [],
      fetchedPrices: { pulsechain: { usd: 1 } },
      wallets: [{ address: '0xwallet', name: 'Main' }],
      previousHistory: [],
      previousRealStakes,
      now: 1,
    });

    expect(snapshot.realStakes).toEqual(previousRealStakes);
  });
});
