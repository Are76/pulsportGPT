import React from 'react';
import { MyInvestmentsAssetPanel } from '../components/my-investments/MyInvestmentsAssetPanel';
import { MyInvestmentsFilters } from '../components/my-investments/MyInvestmentsFilters';
import { MyInvestmentsHero } from '../components/my-investments/MyInvestmentsHero';
import { MyInvestmentsTable } from '../components/my-investments/MyInvestmentsTable';
import type { InvestmentHoldingRow } from '../types';

interface MyInvestmentsPageProps {
  investedFiat: number;
  currentValue: number;
  liquidValue: number;
  stakedValue: number;
  plsUsdPrice: number;
  rows: InvestmentHoldingRow[];
  onOpenTransactions: (row: InvestmentHoldingRow) => void;
}

export function MyInvestmentsPage(props: MyInvestmentsPageProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = React.useState<InvestmentHoldingRow | null>(null);
  const pnlUsd = props.currentValue - props.investedFiat;
  const pnlPercent = props.investedFiat > 0 ? (pnlUsd / props.investedFiat) * 100 : 0;

  return (
    <div className="mi-page">
      <MyInvestmentsHero
        investedFiat={props.investedFiat}
        currentValue={props.currentValue}
        pnlUsd={pnlUsd}
        pnlPercent={pnlPercent}
        liquidValue={props.liquidValue}
        stakedValue={props.stakedValue}
      />
      <MyInvestmentsFilters />
      <MyInvestmentsTable
        rows={props.rows}
        plsUsdPrice={props.plsUsdPrice}
        portfolioValue={props.currentValue}
        expandedId={expandedId}
        onToggleRow={(id) => setExpandedId((current) => current === id ? null : id)}
        onOpenAsset={setSelectedAsset}
        onOpenTransactions={props.onOpenTransactions}
      />
      {selectedAsset ? (
        <MyInvestmentsAssetPanel
          row={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onOpenTransactions={props.onOpenTransactions}
        />
      ) : null}
    </div>
  );
}

export type { MyInvestmentsPageProps };
