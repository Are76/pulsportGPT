import { describe, expect, it, vi } from 'vitest';
import type { WalletAnalyzerModel } from '../utils/buildWalletAnalyzerModel';
import { buildWalletAnalyzerPageProps } from '../features/wallet-analyzer/buildWalletAnalyzerPageProps';

const stubModel = {
  summaryCards: [],
  riskMetrics: { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, diversificationScore: 0 },
  behavior: { averageHoldingPeriodDays: 0, realizedGainUsd: 0, unrealizedGainUsd: 0, realizedVsUnrealizedRatio: 0 },
  allocation: { topHoldings: [{ symbol: 'ETH', chain: 'ethereum', valueUsd: 700, weight: 1 }] },
  contributors: { topHoldings: [{ symbol: 'ETH', chain: 'ethereum', currentValue: 700, moveUsd: 100, weight: 1 }] },
  chainMix: { rows: [{ chain: 'ethereum', valueUsd: 700, weight: 1, moveUsd: 100 }] },
  performance: { points: [], benchmarkPoints: [] },
  benchmark: [],
  alerts: [],
  nav: { totalValue: 700, cumulativeReturn: 0, diversificationScore: 50 },
  risk: { volatility: 0, sharpeRatio: 0, maxDrawdown: 0 },
  rotation: { totalPnlPls: 0, realizedPnlPls: 0, unrealizedPnlPls: 0, realizedRotationCount: 0, pairStats: [] },
} as unknown as WalletAnalyzerModel;

const sampleRows = [
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    chain: 'ethereum' as const,
    amount: 0.2,
    currentPrice: 3500,
    currentValue: 700,
    costBasis: 600,
    pnlUsd: 100,
    pnlPercent: 16.6,
    sourceMix: [],
    routeSummary: 'Ethereum',
    thenValue: 600,
    nowValue: 700,
  },
];

describe('buildWalletAnalyzerPageProps', () => {
  it('builds analyzer page props and resolves drill-down lookups', () => {
    const onOpenTransactions = vi.fn();

    const result = buildWalletAnalyzerPageProps({
      model: stubModel,
      investmentRows: sampleRows,
      plsUsdPrice: 0.00008,
      onOpenTransactions,
      onOpenPlanner: vi.fn(),
    });

    result.pageProps.onOpenTransactionsForHolding({ symbol: 'ETH', chain: 'ethereum' });
    result.pageProps.onOpenTransactionsForChain('ethereum');

    expect(result.pageProps.plsUsdPrice).toBe(0.00008);
    expect(onOpenTransactions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'asset', symbol: 'ETH', chain: 'ethereum', txType: 'all' }),
    );
    expect(onOpenTransactions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'chain', chain: 'ethereum', txType: 'all' }),
    );
  });

  it('includes onOpenPlanner in pageProps', () => {
    const onOpenPlanner = vi.fn();
    const { pageProps } = buildWalletAnalyzerPageProps({
      model: stubModel,
      investmentRows: [],
      plsUsdPrice: 0.00008,
      onOpenTransactions: vi.fn(),
      onOpenPlanner,
    });

    expect(pageProps.onOpenPlanner).toBe(onOpenPlanner);
  });

  it('onOpenTransactionsForChain always uses txType "all" — not "swap"', () => {
    const onOpenTransactions = vi.fn();
    const { pageProps } = buildWalletAnalyzerPageProps({
      model: stubModel,
      investmentRows: [],
      plsUsdPrice: 0.00008,
      onOpenTransactions,
      onOpenPlanner: vi.fn(),
    });

    pageProps.onOpenTransactionsForChain('base');

    const intent = onOpenTransactions.mock.calls[0]?.[0];
    expect(intent.txType).toBe('all');
  });

  it('onOpenTransactionsForHolding falls back to txType "all" when holding is not in investmentRows', () => {
    const onOpenTransactions = vi.fn();
    const { pageProps } = buildWalletAnalyzerPageProps({
      model: stubModel,
      investmentRows: [],
      plsUsdPrice: 0.00008,
      onOpenTransactions,
      onOpenPlanner: vi.fn(),
    });

    pageProps.onOpenTransactionsForHolding({ chain: 'pulsechain', symbol: 'UNKNOWN' });

    const intent = onOpenTransactions.mock.calls[0]?.[0];
    expect(intent.kind).toBe('asset');
    expect(intent.symbol).toBe('UNKNOWN');
    expect(intent.txType).toBe('all');
  });

  it('passes model, investmentRows, plsUsdPrice, and onOpenTransactions through unchanged', () => {
    const onOpenTransactions = vi.fn();
    const { pageProps } = buildWalletAnalyzerPageProps({
      model: stubModel,
      investmentRows: sampleRows,
      plsUsdPrice: 0.00005,
      onOpenTransactions,
      onOpenPlanner: vi.fn(),
    });

    expect(pageProps.model).toBe(stubModel);
    expect(pageProps.investmentRows).toBe(sampleRows);
    expect(pageProps.plsUsdPrice).toBe(0.00005);
    expect(pageProps.onOpenTransactions).toBe(onOpenTransactions);
  });
});
