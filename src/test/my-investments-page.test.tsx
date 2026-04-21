import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InvestmentHoldingRow } from '../types';
import { MyInvestmentsHero } from '../components/my-investments/MyInvestmentsHero';

describe('investment holding row shape', () => {
  it('supports invested fiat and current asset attribution fields', () => {
    const row: InvestmentHoldingRow = {
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
      sourceMix: [
        { asset: 'ETH', chain: 'ethereum', amountUsd: 500 },
        { asset: 'USDC', chain: 'base', amountUsd: 221.82 },
      ],
      routeSummary: 'Ethereum -> Bridge -> PulseX -> HEX',
      thenValue: 721.82,
      nowValue: 596.28,
    };

    expect(row.sourceMix).toHaveLength(2);
    expect(row.routeSummary).toContain('Bridge');
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
