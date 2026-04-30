import { describe, expect, it } from 'vitest';
import type { HistoryPoint, Transaction } from '../types';
import {
  calculateBehaviorStats,
  calculateBenchmarkComparison,
  calculateChainAttribution,
  calculateDiversificationScore,
  calculatePortfolioHistory,
  calculatePulsechainCoreRotationPnlPls,
  calculateRiskMetrics,
  extractPulsechainCoreRotationSwaps,
} from '../utils/portfolioAnalytics';

describe('portfolioAnalytics', () => {
  const history: HistoryPoint[] = [
    { timestamp: Date.UTC(2026, 3, 20), value: 100, nativeValue: 1000, pnl: 0 },
    { timestamp: Date.UTC(2026, 3, 21), value: 110, nativeValue: 1100, pnl: 10 },
    { timestamp: Date.UTC(2026, 3, 22), value: 99, nativeValue: 990, pnl: -11 },
    { timestamp: Date.UTC(2026, 3, 23), value: 120, nativeValue: 1200, pnl: 21 },
  ];

  it('calculates cumulative return and drawdown from portfolio history points', () => {
    const result = calculatePortfolioHistory(history);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      cumulativeReturn: 0,
      drawdown: 0,
    });
    expect(result[1]?.cumulativeReturn).toBeCloseTo(0.1, 5);
    expect(result[2]?.cumulativeReturn).toBeCloseTo(-0.01, 5);
    expect(result[2]?.drawdown).toBeCloseTo(-0.1, 5);
    expect(result[3]?.cumulativeReturn).toBeCloseTo(0.2, 5);
  });

  it('derives volatility, sharpe, and max drawdown from history', () => {
    const metrics = calculateRiskMetrics(history);

    expect(metrics.maxDrawdown).toBeCloseTo(-0.1, 5);
    expect(metrics.volatility).toBeGreaterThan(0);
    expect(metrics.sharpeRatio).toBeGreaterThan(0);
  });

  it('scores diversified allocations above concentrated ones', () => {
    const diversified = calculateDiversificationScore({
      ETH: 400,
      USDC: 350,
      HEX: 250,
    });
    const concentrated = calculateDiversificationScore({
      ETH: 950,
      USDC: 50,
    });

    expect(diversified).toBeGreaterThan(concentrated);
    expect(diversified).toBeGreaterThan(70);
    expect(concentrated).toBeLessThan(20);
  });

  it('compares portfolio history against a benchmark timeline', () => {
    const benchmark: HistoryPoint[] = [
      { timestamp: Date.UTC(2026, 3, 20), value: 100, nativeValue: 100, pnl: 0 },
      { timestamp: Date.UTC(2026, 3, 21), value: 102, nativeValue: 102, pnl: 2 },
      { timestamp: Date.UTC(2026, 3, 22), value: 101, nativeValue: 101, pnl: -1 },
      { timestamp: Date.UTC(2026, 3, 23), value: 104, nativeValue: 104, pnl: 3 },
    ];

    const comparison = calculateBenchmarkComparison(history, benchmark);

    expect(comparison.portfolioReturn).toBeCloseTo(0.2, 5);
    expect(comparison.benchmarkReturn).toBeCloseTo(0.04, 5);
    expect(comparison.excessReturn).toBeCloseTo(0.16, 5);
  });

  it('computes realized and unrealized gains with fifo holding periods', () => {
    const transactions: Transaction[] = [
      {
        id: 'buy-1',
        hash: '0x1',
        timestamp: Date.UTC(2026, 0, 1),
        type: 'deposit',
        from: '0xexternal',
        to: '0xwallet',
        asset: 'HEX',
        amount: 100,
        valueUsd: 100,
        chain: 'pulsechain',
      },
      {
        id: 'buy-2',
        hash: '0x2',
        timestamp: Date.UTC(2026, 0, 11),
        type: 'deposit',
        from: '0xexternal',
        to: '0xwallet',
        asset: 'HEX',
        amount: 50,
        valueUsd: 75,
        chain: 'pulsechain',
      },
      {
        id: 'sell-1',
        hash: '0x3',
        timestamp: Date.UTC(2026, 0, 21),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'USDC',
        amount: 180,
        counterAsset: 'HEX',
        counterAmount: 100,
        counterPriceUsdAtTx: 1,
        valueUsd: 180,
        chain: 'pulsechain',
      },
    ];

    const stats = calculateBehaviorStats(
      transactions,
      { 'pulsechain:HEX': 2 },
      Date.UTC(2026, 0, 31),
    );

    expect(stats.realizedGainUsd).toBeCloseTo(80, 5);
    expect(stats.unrealizedCostBasisUsd).toBeCloseTo(75, 5);
    expect(stats.unrealizedValueUsd).toBeCloseTo(100, 5);
    expect(stats.unrealizedGainUsd).toBeCloseTo(25, 5);
    expect(stats.averageHoldingPeriodDays).toBeCloseTo(20, 5);
    expect(stats.realizedSalesCount).toBe(1);
  });

  it('derives chain attribution from actual historical chain pnl points', () => {
    const attribution = calculateChainAttribution(history, {
      pulsechain: 300,
      ethereum: 700,
      base: 200,
    });

    expect(attribution).toEqual([
      expect.objectContaining({
        chain: 'ethereum',
        moveUsd: 0,
        startValueUsd: 700,
        endValueUsd: 700,
      }),
      expect.objectContaining({
        chain: 'pulsechain',
        moveUsd: 0,
        startValueUsd: 300,
        endValueUsd: 300,
      }),
      expect.objectContaining({
        chain: 'base',
        moveUsd: 0,
        startValueUsd: 200,
        endValueUsd: 200,
      }),
    ]);

    const attributionWithChainPnl = calculateChainAttribution(
      history.map((point, index) => ({
        ...point,
        chainPnl: {
          pulsechain: index === 0 ? 0 : 10,
          ethereum: index === 0 ? 0 : 5,
          base: index === 0 ? 0 : -2,
        },
      })),
      {
        pulsechain: 300,
        ethereum: 700,
        base: 200,
      },
    );

    expect(attributionWithChainPnl).toEqual([
      expect.objectContaining({
        chain: 'ethereum',
        moveUsd: 15,
        startValueUsd: 685,
        endValueUsd: 700,
      }),
      expect.objectContaining({
        chain: 'pulsechain',
        moveUsd: 30,
        startValueUsd: 270,
        endValueUsd: 300,
      }),
      expect.objectContaining({
        chain: 'base',
        moveUsd: -6,
        startValueUsd: 206,
        endValueUsd: 200,
      }),
    ]);
  });

  it('extracts only PulseChain core-to-core swaps and normalizes PLS and HEX symbols', () => {
    const rotations = extractPulsechainCoreRotationSwaps([
      {
        id: '1',
        hash: '0x1',
        timestamp: Date.UTC(2026, 0, 1),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'WPLS',
        amount: 1000,
        counterAsset: 'PLSX',
        counterAmount: 100,
        chain: 'pulsechain',
      },
      {
        id: '2',
        hash: '0x2',
        timestamp: Date.UTC(2026, 0, 2),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'HEX',
        amount: 10_000,
        counterAsset: 'INC',
        counterAmount: 50,
        chain: 'pulsechain',
      },
      {
        id: '3',
        hash: '0x3',
        timestamp: Date.UTC(2026, 0, 3),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'ETH',
        amount: 1,
        counterAsset: 'USDC',
        counterAmount: 1000,
        chain: 'ethereum',
      },
    ]);

    expect(rotations).toEqual([
      expect.objectContaining({
        soldSymbol: 'PLSX',
        boughtSymbol: 'PLS',
      }),
      expect.objectContaining({
        soldSymbol: 'INC',
        boughtSymbol: 'pHEX',
      }),
    ]);
  });

  it('calculates realized and unrealized PulseChain core rotation pnl in PLS terms', () => {
    const rotations = extractPulsechainCoreRotationSwaps([
      {
        id: 'buy-plsx',
        hash: '0x1',
        timestamp: Date.UTC(2026, 0, 1),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'PLSX',
        amount: 100,
        counterAsset: 'PLS',
        counterAmount: 1000,
        chain: 'pulsechain',
      },
      {
        id: 'rotate-inc',
        hash: '0x2',
        timestamp: Date.UTC(2026, 0, 2),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'INC',
        amount: 50,
        counterAsset: 'PLSX',
        counterAmount: 100,
        assetPriceUsdAtTx: 3,
        counterPriceUsdAtTx: 1.5,
        valueUsd: 150,
        chain: 'pulsechain',
      },
      {
        id: 'rotate-prvx',
        hash: '0x3',
        timestamp: Date.UTC(2026, 0, 3),
        type: 'swap',
        from: '0xwallet',
        to: '0xwallet',
        asset: 'PRVX',
        amount: 100,
        counterAsset: 'PLS',
        counterAmount: 1000,
        chain: 'pulsechain',
      },
    ]);

    const pnl = calculatePulsechainCoreRotationPnlPls(
      rotations,
      {
        'pulsechain:INC': 4,
        'pulsechain:PRVX': 1.4,
      },
      0.1,
      () => 0.1,
    );

    expect(pnl.realizedPnlPls).toBeCloseTo(500, 5);
    expect(pnl.unrealizedCostBasisPls).toBeCloseTo(2500, 5);
    expect(pnl.unrealizedValuePls).toBeCloseTo(3400, 5);
    expect(pnl.unrealizedPnlPls).toBeCloseTo(900, 5);
    expect(pnl.totalPnlPls).toBeCloseTo(1400, 5);
    expect(pnl.realizedRotationCount).toBe(1);
    expect(pnl.pairStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pair: 'PLSX->INC',
          realizedPnlPls: 500,
        }),
        expect.objectContaining({
          pair: 'PLS->PRVX',
          realizedPnlPls: 0,
        }),
        expect.objectContaining({
          pair: 'PLS->PLSX',
          realizedPnlPls: 0,
        }),
      ]),
    );
  });
});
