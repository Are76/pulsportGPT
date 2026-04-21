import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
        onOpenPlanner={() => {}}
      />
    );

    expect(screen.getByText('Invested Fiat')).toBeInTheDocument();
    expect(screen.getByText('$27,465')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /profit planner/i })).toBeInTheDocument();
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

    render(<MyInvestmentsTable rows={rows} expandedId={null} onToggleRow={() => {}} onOpenAsset={() => {}} />);

    const table = screen.getByRole('table');
    const renderedRows = within(table).getAllByRole('row');
    expect(renderedRows[1]).toHaveTextContent('INC');
    expect(renderedRows[2]).toHaveTextContent('PRVX');
  });

  it('expands a row to show source capital and route details', () => {
    function Harness() {
      const [expandedId, setExpandedId] = React.useState<string | null>(null);
      return (
        <MyInvestmentsTable
          rows={[sampleRow]}
          expandedId={expandedId}
          onToggleRow={(id) => setExpandedId(id)}
          onOpenAsset={() => {}}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /125.54/i }));

    expect(screen.getByText(/Ethereum -> Bridge -> PulseX -> HEX/i)).toBeInTheDocument();
    expect(screen.getByText(/ETH .* ethereum .* \$721.82/i)).toBeInTheDocument();
    expect(screen.getByText('Then')).toBeInTheDocument();
    expect(screen.getAllByText('$721.82').length).toBeGreaterThan(1);
  });
});

describe('MyInvestmentsAssetPanel', () => {
  it('shows compact asset detail and a transaction handoff action', () => {
    render(
      <MyInvestmentsAssetPanel
        row={sampleRow}
        onClose={() => {}}
        onOpenTransactions={() => {}}
      />
    );

    expect(screen.getByRole('heading', { name: 'HEX' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view full transactions/i })).toBeInTheDocument();
  });
});

describe('MyInvestmentsPage', () => {
  it('renders the hero, filters, holdings table, and planner action together', () => {
    render(
      <MyInvestmentsPage
        investedFiat={27465}
        currentValue={7201}
        liquidValue={5723}
        stakedValue={1478}
        rows={[sampleRow]}
        onOpenPlanner={() => {}}
        onOpenTransactions={() => {}}
      />
    );

    expect(screen.getByText('Invested Fiat')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: /chain filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /profit planner/i })).toBeInTheDocument();
  });
});


