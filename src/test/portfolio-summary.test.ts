import { describe, expect, it } from 'vitest';
import type { Asset, HexStake, Transaction, Wallet } from '../types';
import { calculatePortfolioSummary } from '../features/portfolio/usePortfolioSummaryController';

function makeAsset(overrides: Partial<Asset> & Pick<Asset, 'symbol' | 'chain'>): Asset {
  return {
    id: overrides.symbol,
    name: overrides.symbol,
    balance: 100,
    price: 1,
    value: 100,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'chain' | 'asset'>): Transaction {
  return {
    id: `tx-${Math.random()}`,
    hash: '0xhash',
    timestamp: Date.now(),
    from: '0xexternal',
    to: '0xwallet',
    amount: 1,
    ...overrides,
  };
}

const emptyStakes: HexStake[] = [];
const emptyPrices = {};

describe('calculatePortfolioSummary', () => {
  describe('wallet address safety guard', () => {
    it('handles wallets with undefined address without throwing', () => {
      const wallets = [
        { address: undefined as unknown as string, name: 'Bad wallet' },
        { address: '0xwallet', name: 'Good wallet' },
      ] as Wallet[];

      expect(() =>
        calculatePortfolioSummary({
          currentAssets: [],
          currentStakes: emptyStakes,
          currentTransactions: [],
          prices: emptyPrices,
          wallets,
        }),
      ).not.toThrow();
    });

    it('handles wallets with null address without throwing', () => {
      const wallets = [
        { address: null as unknown as string, name: 'Null wallet' },
      ] as Wallet[];

      expect(() =>
        calculatePortfolioSummary({
          currentAssets: [],
          currentStakes: emptyStakes,
          currentTransactions: [],
          prices: emptyPrices,
          wallets,
        }),
      ).not.toThrow();
    });

    it('only counts addresses from wallets with valid strings for ownAddrs matching', () => {
      const wallets = [
        { address: '0xwallet', name: 'Valid' },
        { address: null as unknown as string, name: 'Null' },
        { address: undefined as unknown as string, name: 'Undefined' },
      ] as Wallet[];

      // A deposit from external to 0xwallet should count as a qualified inflow
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'ethereum',
        asset: 'ETH',
        from: '0xexternal',
        to: '0xwallet',
        amount: 1,
        valueUsd: 3000,
      });

      const result = calculatePortfolioSummary({
        currentAssets: [],
        currentStakes: emptyStakes,
        currentTransactions: [tx],
        prices: { ethereum: { usd: 3000 } },
        wallets,
      });

      // The deposit to 0xwallet from an external address should count as net investment
      expect(result.netInvestment).toBeGreaterThan(0);
    });
  });

  describe('transaction field guards', () => {
    it('skips transactions without an asset field in qualified inflow calculation', () => {
      const wallets: Wallet[] = [{ address: '0xwallet', name: 'Wallet' }];
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'ethereum',
        asset: undefined as unknown as string,
        from: '0xexternal',
        to: '0xwallet',
        amount: 1,
      });

      expect(() =>
        calculatePortfolioSummary({
          currentAssets: [],
          currentStakes: emptyStakes,
          currentTransactions: [tx],
          prices: emptyPrices,
          wallets,
        }),
      ).not.toThrow();
    });

    it('skips transactions without a from field in qualified inflow calculation', () => {
      const wallets: Wallet[] = [{ address: '0xwallet', name: 'Wallet' }];
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'ethereum',
        asset: 'ETH',
        from: undefined as unknown as string,
        to: '0xwallet',
        amount: 1,
      });

      expect(() =>
        calculatePortfolioSummary({
          currentAssets: [],
          currentStakes: emptyStakes,
          currentTransactions: [tx],
          prices: emptyPrices,
          wallets,
        }),
      ).not.toThrow();
    });

    it('skips transactions without a to field in qualified inflow calculation', () => {
      const wallets: Wallet[] = [{ address: '0xwallet', name: 'Wallet' }];
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'ethereum',
        asset: 'USDC',
        from: '0xexternal',
        to: undefined as unknown as string,
        amount: 100,
      });

      expect(() =>
        calculatePortfolioSummary({
          currentAssets: [],
          currentStakes: emptyStakes,
          currentTransactions: [tx],
          prices: emptyPrices,
          wallets,
        }),
      ).not.toThrow();
    });

    it('does not count pulsechain deposits as qualified inflows', () => {
      const wallets: Wallet[] = [{ address: '0xwallet', name: 'Wallet' }];
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'pulsechain',
        asset: 'PLS',
        from: '0xexternal',
        to: '0xwallet',
        amount: 1000,
        valueUsd: 50,
      });

      const result = calculatePortfolioSummary({
        currentAssets: [],
        currentStakes: emptyStakes,
        currentTransactions: [tx],
        prices: emptyPrices,
        wallets,
      });

      expect(result.netInvestment).toBe(0);
    });

    it('does not count deposits from own wallets as qualified inflows', () => {
      const wallets: Wallet[] = [
        { address: '0xwallet1', name: 'Wallet 1' },
        { address: '0xwallet2', name: 'Wallet 2' },
      ];
      // from own wallet → not external capital
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'ethereum',
        asset: 'ETH',
        from: '0xwallet1',
        to: '0xwallet2',
        amount: 1,
        valueUsd: 3000,
      });

      const result = calculatePortfolioSummary({
        currentAssets: [],
        currentStakes: emptyStakes,
        currentTransactions: [tx],
        prices: { ethereum: { usd: 3000 } },
        wallets,
      });

      // Transfer between own wallets should not increase netInvestment
      expect(result.netInvestment).toBe(0);
    });
  });

  describe('basic summary calculations', () => {
    it('computes total value as the sum of asset values plus staking USD', () => {
      const assets = [
        makeAsset({ symbol: 'PLS', chain: 'pulsechain', value: 500 }),
        makeAsset({ symbol: 'HEX', chain: 'pulsechain', value: 300 }),
      ];

      const result = calculatePortfolioSummary({
        currentAssets: assets,
        currentStakes: emptyStakes,
        currentTransactions: [],
        prices: emptyPrices,
        wallets: [],
      });

      expect(result.totalValue).toBe(800);
      expect(result.liquidValue).toBe(800);
    });

    it('distributes asset values to chain distribution buckets', () => {
      const assets = [
        makeAsset({ symbol: 'PLS', chain: 'pulsechain', value: 400 }),
        makeAsset({ symbol: 'ETH', chain: 'ethereum', value: 200 }),
        makeAsset({ symbol: 'USDC', chain: 'base', value: 100 }),
      ];

      const result = calculatePortfolioSummary({
        currentAssets: assets,
        currentStakes: emptyStakes,
        currentTransactions: [],
        prices: emptyPrices,
        wallets: [],
      });

      expect(result.chainDistribution.pulsechain).toBe(400);
      expect(result.chainDistribution.ethereum).toBe(200);
      expect(result.chainDistribution.base).toBe(100);
    });

    it('returns zero pnl24hPercent when totalValue is zero', () => {
      const result = calculatePortfolioSummary({
        currentAssets: [],
        currentStakes: emptyStakes,
        currentTransactions: [],
        prices: emptyPrices,
        wallets: [],
      });

      expect(result.pnl24hPercent).toBe(0);
    });

    it('computes holdingsValue across all chains (not just pulsechain)', () => {
      // This tests the change: holdingsValue now sums all assets, not just pulsechain
      const assets = [
        makeAsset({ symbol: 'ETH', chain: 'ethereum', balance: 1, price: 3000, value: 3000 }),
        makeAsset({ symbol: 'USDC', chain: 'base', balance: 100, price: 1, value: 100 }),
      ];

      const result = calculatePortfolioSummary({
        currentAssets: assets,
        currentStakes: emptyStakes,
        currentTransactions: [],
        prices: emptyPrices,
        wallets: [],
      });

      // Total value includes assets from all chains
      expect(result.totalValue).toBe(3100);
    });
  });

  describe('USDC deposit counting', () => {
    it('counts stablecoin deposits from external sources as net investment', () => {
      const wallets: Wallet[] = [{ address: '0xwallet', name: 'Wallet' }];
      const tx = makeTransaction({
        type: 'deposit',
        chain: 'ethereum',
        asset: 'USDC',
        from: '0xexchange',
        to: '0xwallet',
        amount: 1000,
        valueUsd: 1000,
      });

      const result = calculatePortfolioSummary({
        currentAssets: [],
        currentStakes: emptyStakes,
        currentTransactions: [tx],
        prices: emptyPrices,
        wallets,
      });

      expect(result.netInvestment).toBe(1000);
    });

    it('deduplicates bridge transfers within 12 hours of the same amount', () => {
      const wallets: Wallet[] = [
        { address: '0xwallet-eth', name: 'Ethereum Wallet' },
        { address: '0xwallet-base', name: 'Base Wallet' },
      ];
      const now = Date.now();

      // First deposit: USDC on ethereum from external
      const tx1 = makeTransaction({
        id: 'tx-eth',
        type: 'deposit',
        chain: 'ethereum',
        asset: 'USDC',
        from: '0xexchange',
        to: '0xwallet-eth',
        amount: 1000,
        valueUsd: 1000,
        timestamp: now,
      });

      // Second deposit: USDC on base shortly after (bridge duplicate)
      const tx2 = makeTransaction({
        id: 'tx-base',
        type: 'deposit',
        chain: 'base',
        asset: 'USDC',
        from: '0xbridge',
        to: '0xwallet-base',
        amount: 998,  // slightly less due to bridge fee
        valueUsd: 998,
        timestamp: now + 60_000, // 1 minute later
      });

      const result = calculatePortfolioSummary({
        currentAssets: [],
        currentStakes: emptyStakes,
        currentTransactions: [tx1, tx2],
        prices: emptyPrices,
        wallets,
      });

      // Only one of the two near-identical amounts should count
      expect(result.netInvestment).toBe(1000);
    });
  });
});