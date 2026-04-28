import React from 'react';
import { MyInvestmentsAssetPanel } from '../components/my-investments/MyInvestmentsAssetPanel';
import { MyInvestmentsFilters } from '../components/my-investments/MyInvestmentsFilters';
import { MyInvestmentsHero } from '../components/my-investments/MyInvestmentsHero';
import { MyInvestmentsTable } from '../components/my-investments/MyInvestmentsTable';
import { buildAssetHistoryIntent, type HistoryDrilldownIntent } from '../features/history/historyDrilldown';
import type { InvestmentHoldingRow } from '../types';

type InvestmentChainFilter = 'all' | 'pulsechain' | 'ethereum' | 'base';

interface MyInvestmentsPageProps {
  investedFiat: number;
  currentValue: number;
  liquidValue: number;
  stakedValue: number;
  plsUsdPrice: number;
  rows: InvestmentHoldingRow[];
  onOpenTransactions: (intent: HistoryDrilldownIntent) => void;
}

export function MyInvestmentsPage(props: MyInvestmentsPageProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = React.useState<InvestmentHoldingRow | null>(null);
  const [chainFilter, setChainFilter] = React.useState<InvestmentChainFilter>('all');
  const pnlUsd = props.currentValue - props.investedFiat;
  const pnlPercent = props.investedFiat > 0 ? (pnlUsd / props.investedFiat) * 100 : 0;
  const chainCounts = React.useMemo(() => ({
    all: props.rows.length,
    pulsechain: props.rows.filter((row) => row.chain === 'pulsechain').length,
    ethereum: props.rows.filter((row) => row.chain === 'ethereum').length,
    base: props.rows.filter((row) => row.chain === 'base').length,
  }), [props.rows]);
  const filteredRows = React.useMemo(
    () => chainFilter === 'all' ? props.rows : props.rows.filter((row) => row.chain === chainFilter),
    [chainFilter, props.rows],
  );

  React.useEffect(() => {
    if (expandedId && !filteredRows.some((row) => row.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, filteredRows]);

  React.useEffect(() => {
    if (selectedAsset && !filteredRows.some((row) => row.id === selectedAsset.id)) {
      setSelectedAsset(null);
    }
  }, [filteredRows, selectedAsset]);

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
      <MyInvestmentsFilters
        activeFilter={chainFilter}
        counts={chainCounts}
        onChange={setChainFilter}
      />
      <MyInvestmentsTable
        rows={filteredRows}
        plsUsdPrice={props.plsUsdPrice}
        portfolioValue={props.currentValue}
        expandedId={expandedId}
        onToggleRow={(id) => setExpandedId((current) => current === id ? null : id)}
        onOpenAsset={setSelectedAsset}
        onOpenTransactions={(row) => props.onOpenTransactions(buildAssetHistoryIntent(row))}
      />
      {selectedAsset ? (
        <MyInvestmentsAssetPanel
          row={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onOpenTransactions={(row) => props.onOpenTransactions(buildAssetHistoryIntent(row))}
        />
      ) : null}
    </div>
  );
}

export type { MyInvestmentsPageProps };
