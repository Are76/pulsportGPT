import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Asset, HistoryPoint, InvestmentHoldingRow, PortfolioSummary, Transaction } from '../types';
import { buildWalletAnalyzerPageProps } from '../features/wallet-analyzer/buildWalletAnalyzerPageProps';
import { buildWalletAnalyzerModel } from '../utils/buildWalletAnalyzerModel';
import { WalletAnalyzerPage } from '../pages/WalletAnalyzer';

const history: HistoryPoint[] = [
  { timestamp: Date.UTC(2026, 3, 20), value: 1000, nativeValue: 1_000_000, pnl: 0 },
  { timestamp: Date.UTC(2026, 3, 21), value: 1050, nativeValue: 1_050_000, pnl: 50 },
  { timestamp: Date.UTC(2026, 3, 22), value: 1020, nativeValue: 1_020_000, pnl: -30 },
  { timestamp: Date.UTC(2026, 3, 23), value: 1200, nativeValue: 1_200_000, pnl: 180 },
];

const assets: Asset[] = [
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    balance: 0.2,
    price: 3500,
    value: 700,
    chain: 'ethereum',
  },
  {
    id: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    balance: 500,
    price: 1,
    value: 500,
    chain: 'base',
  },
];

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
    id: 'sell-1',
    hash: '0x2',
    timestamp: Date.UTC(2026, 0, 21),
    type: 'swap',
    from: '0xwallet',
    to: '0xwallet',
    asset: 'USDC',
    amount: 180,
    valueUsd: 180,
    counterAsset: 'HEX',
    counterAmount: 100,
    chain: 'pulsechain',
  },
];

const rows: InvestmentHoldingRow[] = [
  {
    id: 'hex',
    symbol: 'HEX',
    name: 'HEX',
    chain: 'pulsechain',
    amount: 100,
    currentPrice: 1.2,
    currentValue: 120,
    costBasis: 100,
    pnlUsd: 20,
    pnlPercent: 20,
    sourceMix: [{ asset: 'ETH', chain: 'ethereum', amountUsd: 100 }],
    routeSummary: 'Ethereum -> Bridge -> PulseX -> HEX',
    thenValue: 100,
    nowValue: 120,
  },
];

const summary: PortfolioSummary = {
  totalValue: 1200,
  pnl24h: 40,
  pnl24hPercent: 3.4,
  chainDistribution: {
    pulsechain: 0,
    ethereum: 700,
    base: 500,
  },
  nativeValue: 1_200_000,
  netInvestment: 900,
  unifiedPnl: 300,
  realizedPnl: 180,
  chainPnlUsd: {
    pulsechain: 0,
    ethereum: 220,
    base: 80,
  },
  chainPnlPercent: {
    pulsechain: 0,
    ethereum: 22,
    base: 8,
  },
};

describe('buildWalletAnalyzerModel', () => {
  it('builds chart, risk, behavior, and alert sections from current portfolio state', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    expect(model.performance.points).toHaveLength(4);
    expect(model.risk.maxDrawdown).toBeLessThan(0);
    expect(model.behavior.realizedGainUsd).toBeGreaterThan(0);
    expect(model.allocation.topHoldings[0]).toMatchObject({ symbol: 'HEX' });
    expect(model.alerts.length).toBeGreaterThan(0);
  });

  it('keeps enough performance history to support range switching', () => {
    const model = buildWalletAnalyzerModel({
      history: [
        ...history,
        { timestamp: Date.UTC(2026, 3, 24), value: 1220, nativeValue: 1_220_000, pnl: 20 },
        { timestamp: Date.UTC(2026, 3, 25), value: 1180, nativeValue: 1_180_000, pnl: -40 },
      ],
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    expect(model.performance.points.length).toBeGreaterThanOrEqual(5);
  });

  it('uses investment rows as the canonical holdings source for allocation and chain mix', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets: [
        {
          id: 'raw-eth',
          symbol: 'ETH',
          name: 'Ethereum',
          balance: 1,
          price: 3500,
          value: 3500,
          chain: 'ethereum',
        },
      ],
      summary: {
        ...summary,
        totalValue: 3500,
        chainDistribution: {
          pulsechain: 0,
          ethereum: 3500,
          base: 0,
        },
      },
      transactions,
      investmentRows: [
        {
          ...rows[0]!,
          id: 'hex',
          symbol: 'HEX',
          name: 'HEX',
          chain: 'pulsechain',
          currentValue: 120,
          costBasis: 100,
          pnlUsd: 20,
          pnlPercent: 20,
          thenValue: 100,
          nowValue: 120,
        },
      ],
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    expect(model.nav.totalValue).toBe(120);
    expect(model.allocation.topHoldings[0]).toMatchObject({
      symbol: 'HEX',
      chain: 'pulsechain',
      valueUsd: 120,
    });
    expect(model.chainMix.rows).toEqual([
      expect.objectContaining({
        chain: 'pulsechain',
        valueUsd: 120,
      }),
    ]);
  });

  it('carries PulseChain core rotation pnl into the analyzer model', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions: [
        {
          id: 'buy-plsx',
          hash: '0x11',
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
          hash: '0x12',
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
      ],
      investmentRows: rows,
      currentPrices: {
        pulsechain: 0.1,
        'pulsechain:INC': 4,
        'pulsechain:HEX': 1.2,
      },
    });

    expect(model.rotation.realizedPnlPls).toBeCloseTo(500, 5);
    expect(model.rotation.pairStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pair: 'PLSX->INC',
          realizedPnlPls: 500,
        }),
      ]),
    );
  });
});

describe('WalletAnalyzerPage', () => {
  function renderWalletAnalyzerPage(
    model: ReturnType<typeof buildWalletAnalyzerModel>,
    investmentRows: InvestmentHoldingRow[],
    onOpenTransactions = vi.fn(),
    onOpenPlanner = vi.fn(),
  ) {
    const pageProps = buildWalletAnalyzerPageProps({
      model,
      investmentRows,
      plsUsdPrice: 0.00008,
      onOpenTransactions,
      onOpenPlanner,
    }).pageProps;

    render(<WalletAnalyzerPage {...pageProps} />);

    return { onOpenTransactions, onOpenPlanner };
  }

  it('renders the first user-facing analyzer slice with range controls and allocation bars', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, rows);

    expect(screen.getByRole('heading', { name: /wallet analyzer/i })).toBeInTheDocument();
    expect(screen.getByText(/portfolio performance/i)).toBeInTheDocument();
    expect(screen.getByText(/risk metrics/i)).toBeInTheDocument();
    expect(screen.getByText(/trade behavior/i)).toBeInTheDocument();
    expect(screen.getByText(/allocation breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/top contributors/i)).toBeInTheDocument();
    expect(screen.getByText(/chain mix/i)).toBeInTheDocument();
    expect(screen.getByText(/core rotation vs pls/i)).toBeInTheDocument();
    expect(screen.getByText(/what changed this range/i)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /holdings attribution/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^1w$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1m$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByTestId('allocation-bar-HEX')).toBeInTheDocument();
    expect(screen.getByText(/portfolio nav/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^benchmark$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1m move/i).length).toBeGreaterThan(0);
  });

  it('switches the active performance range in the page shell', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, rows);

    fireEvent.click(screen.getByRole('button', { name: /^1w$/i }));

    expect(screen.getByRole('button', { name: /^1w$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/1w return/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1w move/i).length).toBeGreaterThan(0);
  });

  it('opens transaction drill-downs from allocation rows', () => {
    const ethRow = {
      ...rows[0]!,
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      chain: 'ethereum' as const,
      currentValue: 700,
      costBasis: 600,
      pnlUsd: 100,
      pnlPercent: 16.6,
      sourceMix: [{ asset: 'ETH', chain: 'ethereum' as const, amountUsd: 600 }],
      routeSummary: 'Ethereum',
      thenValue: 600,
      nowValue: 700,
    };
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: [rows[0]!, ethRow],
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });
    const onOpenTransactions = vi.fn();
    renderWalletAnalyzerPage(model, [rows[0]!, ethRow], onOpenTransactions);

    fireEvent.click(screen.getByRole('button', { name: /view eth transactions/i }));

    expect(onOpenTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'asset', symbol: 'ETH', chain: 'ethereum', txType: 'all' }),
    );
  });

  it('opens provenance details from wallet analyzer metrics', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, rows);

    fireEvent.click(screen.getByRole('button', { name: /open source details for net asset value/i }));

    expect(screen.getByRole('dialog', { name: /net asset value provenance/i })).toBeInTheDocument();
    expect(screen.getByText(/primary source/i)).toBeInTheDocument();
    expect(screen.getByText(/aggregated cross-chain portfolio snapshot/i)).toBeInTheDocument();
  });

  it('opens the profit planner from the analyzer hero', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });
    const onOpenPlanner = vi.fn();

    renderWalletAnalyzerPage(model, rows, vi.fn(), onOpenPlanner);

    fireEvent.click(screen.getByRole('button', { name: /open profit planner/i }));

    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
  });

  it('opens PulseChain swap ledger drill-downs from the core rotation card', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions: [
        {
          id: 'buy-plsx',
          hash: '0x21',
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
          hash: '0x22',
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
      ],
      investmentRows: rows,
      currentPrices: {
        pulsechain: 0.1,
        'pulsechain:INC': 4,
        'pulsechain:HEX': 1.2,
      },
    });
    const onOpenTransactions = vi.fn();

    renderWalletAnalyzerPage(model, rows, onOpenTransactions);

    fireEvent.click(screen.getByRole('button', { name: /open core swaps/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /open flow/i })[0]!);

    expect(onOpenTransactions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'chain', chain: 'pulsechain', txType: 'swap' }),
    );
    expect(onOpenTransactions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'asset', symbol: 'INC', chain: 'pulsechain', txType: 'swap' }),
    );
  });

  it('shows performance point provenance from the chart panel action', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, rows);

    fireEvent.click(screen.getByRole('button', { name: /inspect latest performance point/i }));

    expect(screen.getByRole('dialog', { name: /performance point provenance/i })).toBeInTheDocument();
    expect(screen.getByText(/portfolio snapshot/i)).toBeInTheDocument();
  });

  it('filters holdings attribution by chain like the My Investments page', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: [
        rows[0]!,
        {
          ...rows[0]!,
          id: 'eth',
          symbol: 'ETH',
          name: 'Ethereum',
          chain: 'ethereum',
          currentValue: 700,
          costBasis: 600,
          pnlUsd: 100,
          pnlPercent: 16.6,
          sourceMix: [{ asset: 'ETH', chain: 'ethereum', amountUsd: 600 }],
          routeSummary: 'Ethereum',
          thenValue: 600,
          nowValue: 700,
        },
      ],
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, [
      rows[0]!,
      {
        ...rows[0]!,
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        chain: 'ethereum',
        currentValue: 700,
        costBasis: 600,
        pnlUsd: 100,
        pnlPercent: 16.6,
        sourceMix: [{ asset: 'ETH', chain: 'ethereum', amountUsd: 600 }],
        routeSummary: 'Ethereum',
        thenValue: 600,
        nowValue: 700,
      },
    ]);

    const holdingsFilterTabs = within(screen.getByRole('tablist', { name: /chain filters/i }));

    fireEvent.click(holdingsFilterTabs.getByRole('button', { name: /ethereum/i }));

    expect(holdingsFilterTabs.getByRole('button', { name: /ethereum/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'HEX' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ethereum' })).toBeInTheDocument();
  });

  it('renders contribution bars for analyzer holdings insight', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: [
        rows[0]!,
        {
          ...rows[0]!,
          id: 'eth',
          symbol: 'ETH',
          name: 'Ethereum',
          chain: 'ethereum',
          currentValue: 700,
          costBasis: 600,
          pnlUsd: 100,
          pnlPercent: 16.6,
          sourceMix: [{ asset: 'ETH', chain: 'ethereum', amountUsd: 600 }],
          routeSummary: 'Ethereum',
          thenValue: 600,
          nowValue: 700,
        },
      ],
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, [
      rows[0]!,
      {
        ...rows[0]!,
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        chain: 'ethereum',
        currentValue: 700,
        costBasis: 600,
        pnlUsd: 100,
        pnlPercent: 16.6,
        sourceMix: [{ asset: 'ETH', chain: 'ethereum', amountUsd: 600 }],
        routeSummary: 'Ethereum',
        thenValue: 600,
        nowValue: 700,
      },
    ]);

    expect(screen.getByTestId('contribution-bar-ETH')).toBeInTheDocument();
  });

  it('opens transaction drill-downs from contributor rows', () => {
    const onOpenTransactions = vi.fn();
    const ethRow = {
      ...rows[0]!,
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      chain: 'ethereum' as const,
      currentValue: 700,
      costBasis: 600,
      pnlUsd: 100,
      pnlPercent: 16.6,
      sourceMix: [{ asset: 'ETH', chain: 'ethereum' as const, amountUsd: 600 }],
      routeSummary: 'Ethereum',
      thenValue: 600,
      nowValue: 700,
    };
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: [rows[0]!, ethRow],
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, [rows[0]!, ethRow], onOpenTransactions);

    fireEvent.click(screen.getByRole('button', { name: /view eth flow/i }));

    expect(onOpenTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'asset', symbol: 'ETH', chain: 'ethereum', txType: 'all' }),
    );
  });

  it('renders chain split bars for current portfolio value', () => {
    const model = buildWalletAnalyzerModel({
      history,
      assets,
      summary,
      transactions,
      investmentRows: rows,
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, rows);

    expect(screen.getByTestId('chain-bar-pulsechain')).toBeInTheDocument();
  });

  it('opens transaction drill-downs from the range-change band', () => {
    const onOpenTransactions = vi.fn();
    const ethRow = {
      ...rows[0]!,
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      chain: 'ethereum' as const,
      currentValue: 700,
      costBasis: 600,
      pnlUsd: 100,
      pnlPercent: 16.6,
      sourceMix: [{ asset: 'ETH', chain: 'ethereum' as const, amountUsd: 600 }],
      routeSummary: 'Ethereum',
      thenValue: 600,
      nowValue: 700,
    };
    const baseRow = {
      ...rows[0]!,
      id: 'usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      chain: 'base' as const,
      currentValue: 500,
      costBasis: 520,
      pnlUsd: -20,
      pnlPercent: -3.8,
      sourceMix: [{ asset: 'USDC', chain: 'base' as const, amountUsd: 520 }],
      routeSummary: 'Base',
      thenValue: 520,
      nowValue: 500,
    };
    const model = buildWalletAnalyzerModel({
      history: history.map((point, index) => ({
        ...point,
        chainPnl: {
          pulsechain: 0,
          ethereum: index === 0 ? 0 : 10,
          base: index === 0 ? 0 : -5,
        },
      })),
      assets,
      summary,
      transactions,
      investmentRows: [rows[0]!, ethRow, baseRow],
      currentPrices: {
        'pulsechain:HEX': 1.2,
      },
    });

    renderWalletAnalyzerPage(model, [rows[0]!, ethRow, baseRow], onOpenTransactions);

    fireEvent.click(screen.getByRole('button', { name: /open strongest chain/i }));
    expect(onOpenTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chain', chain: 'ethereum', txType: 'all' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /open largest position move/i }));
    expect(onOpenTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'asset', symbol: 'ETH', chain: 'ethereum', txType: 'all' }),
    );
  });
});
