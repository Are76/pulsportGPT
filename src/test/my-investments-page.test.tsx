import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyInvestmentsAssetPanel } from '../components/my-investments/MyInvestmentsAssetPanel';
import { MyInvestmentsHero } from '../components/my-investments/MyInvestmentsHero';
import { MyInvestmentsTable } from '../components/my-investments/MyInvestmentsTable';
import { MyInvestmentsPage } from '../pages/MyInvestmentsPage';
import type { InvestmentHoldingRow } from '../types';

const sampleRow: InvestmentHoldingRow = {
  id: 'hex',
  symbol: 'HEX',
  name: 'HEX',
  chain: 'pulsechain',
  amount: 425000,
  currentPrice: 0.0014,
  currentValue: 596.28,
  costBasis: 721.82,
  pnlUsd: -125.54,
  pnlPercent: -17.39,
  sourceMix: [{ asset: 'ETH', chain: 'ethereum', amountUsd: 721.82 }],
  routeSummary: 'Ethereum -> Bridge -> PulseX -> HEX',
  thenValue: 721.82,
  nowValue: 596.28,
};

describe('investment holding row shape', () => {
  it('supports invested fiat and current asset attribution fields', () => {
    expect(sampleRow.sourceMix).toHaveLength(1);
    expect(sampleRow.routeSummary).toContain('Bridge');
  });
});

describe('MyInvestmentsHero', () => {
  it('renders invested fiat as the dominant headline label', () => {
    render(
      <MyInvestmentsHero
        investedFiat={27465}
        currentValue={7201}
        pnlUsd={-20264}
        pnlPercent={-73.8}
        liquidValue={5723}
        stakedValue={1478}
      />
    );

    expect(screen.getByText('Invested Fiat')).toBeInTheDocument();
    expect(screen.getByText('$27,465')).toBeInTheDocument();
    expect(screen.getByText('Net P&L')).toBeInTheDocument();
  });
});

describe('MyInvestmentsTable', () => {
  it('sorts holdings by current value descending by default', () => {
    const rows: InvestmentHoldingRow[] = [
      {
        ...sampleRow,
        id: 'prvx',
        symbol: 'PRVX',
        name: 'PRVX',
        currentValue: 133.9,
        costBasis: 120,
        pnlUsd: 13.9,
        pnlPercent: 11.5,
        thenValue: 120,
        nowValue: 133.9,
        sourceMix: [],
      },
      {
        ...sampleRow,
        id: 'inc',
        symbol: 'INC',
        name: 'INC',
        currentValue: 1082,
        costBasis: 900,
        pnlUsd: 182,
        pnlPercent: 20.2,
        thenValue: 900,
        nowValue: 1082,
        sourceMix: [],
      },
    ];

    render(
      <MyInvestmentsTable
        rows={rows}
        plsUsdPrice={0.000078}
        portfolioValue={1215.9}
        expandedId={null}
        onToggleRow={() => {}}
        onOpenAsset={() => {}}
      />
    );

    const assetButtons = screen.getAllByRole('button').filter((node) => ['INC', 'PRVX'].includes(node.textContent || ''));
    expect(assetButtons[0]).toHaveTextContent('INC');
    expect(assetButtons[1]).toHaveTextContent('PRVX');
  });

  it('expands a row to show source capital and route details', () => {
    function Harness() {
      const [expandedId, setExpandedId] = React.useState<string | null>(null);
      return (
        <MyInvestmentsTable
          rows={[sampleRow]}
          plsUsdPrice={0.000078}
          portfolioValue={7201}
          expandedId={expandedId}
          onToggleRow={(id) => setExpandedId(id)}
          onOpenAsset={() => {}}
        />
      );
    }

    const { container } = render(<Harness />);
    const row = container.querySelector('.coin-list-row-main');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText(/Ethereum -> Bridge -> PulseX -> HEX/i)).toBeInTheDocument();
    expect(screen.getByText('Attribution')).toBeInTheDocument();
    expect(screen.getByText('$721.82')).toBeInTheDocument();
  });
});

describe('MyInvestmentsAssetPanel', () => {
  it('shows compact asset detail and a transaction handoff action', () => {
    const onOpenTransactions = vi.fn();
    render(
      <MyInvestmentsAssetPanel
        row={sampleRow}
        onClose={() => {}}
        onOpenTransactions={onOpenTransactions}
      />
    );

    expect(screen.getByRole('heading', { name: 'HEX' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view full transactions/i }));
    expect(onOpenTransactions).toHaveBeenCalledWith(sampleRow);
  });
});

describe('MyInvestmentsPage', () => {
  it('renders the hero, filters, and holdings table without the old utility strip', () => {
    render(
      <MyInvestmentsPage
        investedFiat={27465}
        currentValue={7201}
        liquidValue={5723}
        stakedValue={1478}
        plsUsdPrice={0.000078}
        rows={[sampleRow]}
        onOpenTransactions={() => {}}
      />
    );

    expect(screen.getByText('Invested Fiat')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: /chain filters/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /profit planner/i })).not.toBeInTheDocument();
    expect(screen.queryByText('24H Swap P&L')).not.toBeInTheDocument();
    expect(screen.getByText('Holdings Attribution')).toBeInTheDocument();
  });

  it('opens typed asset history intents from the page shell', () => {
    const onOpenTransactions = vi.fn();
    render(
      <MyInvestmentsPage
        investedFiat={27465}
        currentValue={7201}
        liquidValue={5723}
        stakedValue={1478}
        plsUsdPrice={0.000078}
        rows={[sampleRow]}
        onOpenTransactions={onOpenTransactions}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open hex detail/i }));

    expect(onOpenTransactions).toHaveBeenCalledWith({
      kind: 'asset',
      symbol: 'HEX',
      chain: 'pulsechain',
      txType: 'all',
    });
  });
});


