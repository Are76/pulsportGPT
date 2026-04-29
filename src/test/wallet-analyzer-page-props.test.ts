import { describe, expect, it, vi } from 'vitest';
import type { WalletAnalyzerModel } from '../utils/buildWalletAnalyzerModel';
import { buildWalletAnalyzerPageProps } from '../features/wallet-analyzer/buildWalletAnalyzerPageProps';

describe('buildWalletAnalyzerPageProps', () => {
  it('builds analyzer page props and resolves drill-down lookups', () => {
    const onOpenTransactions = vi.fn();
    const investmentRows = [
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

    const model = {
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
    } as unknown as WalletAnalyzerModel;

    const result = buildWalletAnalyzerPageProps({
      model,
      investmentRows,
      plsUsdPrice: 0.00008,
      onOpenTransactions,
    });

    result.pageProps.onOpenTransactionsForHolding({ symbol: 'ETH', chain: 'ethereum' });
    result.pageProps.onOpenTransactionsForChain('ethereum');

    expect(result.pageProps.plsUsdPrice).toBe(0.00008);
    expect(onOpenTransactions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'asset', symbol: 'ETH', chain: 'ethereum', txType: 'swap' }),
    );
    expect(onOpenTransactions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'chain', chain: 'ethereum', txType: 'swap' }),
    );
  });
});
