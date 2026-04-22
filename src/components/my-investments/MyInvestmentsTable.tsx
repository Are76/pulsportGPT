import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CoinList, type CoinListItem } from '../CoinList';
import type { InvestmentHoldingRow } from '../../types';

const formatUsd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const chainLabel = (chain: InvestmentHoldingRow['chain']) => chain.charAt(0).toUpperCase() + chain.slice(1);

interface MyInvestmentsTableProps {
  rows: InvestmentHoldingRow[];
  plsUsdPrice: number;
  portfolioValue: number;
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  onOpenAsset: (row: InvestmentHoldingRow) => void;
  onOpenTransactions?: (row: InvestmentHoldingRow) => void;
}

export function MyInvestmentsTable({ rows, plsUsdPrice, portfolioValue, expandedId, onToggleRow, onOpenAsset, onOpenTransactions }: MyInvestmentsTableProps) {
  const items = React.useMemo<CoinListItem[]>(() => rows.map((row) => ({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    chain: row.chain,
    logoUrl: row.logoUrl,
    contractAddress: row.address,
    priceUsd: row.currentPrice,
    pricePls: plsUsdPrice > 0 ? row.currentPrice / plsUsdPrice : undefined,
    change24h: row.priceChange24h ?? 0,
    balance: row.amount,
    valueUsd: row.currentValue,
    valuePls: plsUsdPrice > 0 ? row.currentValue / plsUsdPrice : undefined,
    costBasisUsd: row.costBasis,
    pnlUsd: row.pnlUsd,
    pnlPercent: row.pnlPercent,
    meta: undefined,
    tags: row.sourceMix.length > 0 ? row.sourceMix.slice(0, 2).map((source) => source.asset) : undefined,
  })), [rows, plsUsdPrice]);

  const rowMap = React.useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  return (
    <CoinList
      items={items}
      variant="detailed"
      expandedId={expandedId}
      onToggleExpanded={onToggleRow}
      onRowClick={(item) => {
        const row = rowMap.get(item.id);
        if (row) onOpenAsset(row);
      }}
      onOpenExternal={(item) => {
        const row = rowMap.get(item.id);
        if (row && onOpenTransactions) onOpenTransactions(row);
      }}
      onCalculator={(item) => {
        const row = rowMap.get(item.id);
        if (row) onOpenAsset(row);
      }}
      renderExpanded={(item) => {
        const row = rowMap.get(item.id);
        return row ? <MyInvestmentsExpanded row={row} onOpenAsset={onOpenAsset} plsUsdPrice={plsUsdPrice} portfolioValue={portfolioValue} /> : null;
      }}
    />
  );
}

function MyInvestmentsExpanded({
  row,
  onOpenAsset,
  plsUsdPrice,
  portfolioValue,
}: {
  row: InvestmentHoldingRow;
  onOpenAsset: (row: InvestmentHoldingRow) => void;
  plsUsdPrice: number;
  portfolioValue: number;
}) {
  const pnlTone = row.pnlUsd >= 0 ? 'is-positive' : 'is-negative';
  const pricePls = plsUsdPrice > 0 ? row.currentPrice / plsUsdPrice : 0;
  const valuePls = plsUsdPrice > 0 ? row.currentValue / plsUsdPrice : 0;
  const portfolioShare = portfolioValue > 0 ? (row.currentValue / portfolioValue) * 100 : 0;

  return (
    <div className="mi-detail-shell">
      <div className="mi-detail-sections">
        <section className="mi-detail-section">
          <div className="mi-detail-section-head">
            <span className="mi-detail-label">Position</span>
            <strong>{row.symbol}</strong>
          </div>
          <div className="mi-detail-grid">
            <div className="mi-detail-card">
              <span className="mi-detail-label">Balance</span>
              <strong className="mi-detail-number">{row.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong>
              <small>{row.symbol}</small>
            </div>
            <div className="mi-detail-card">
              <span className="mi-detail-label">USD Value</span>
              <strong className="mi-detail-number">{formatUsd(row.currentValue)}</strong>
              <small>{valuePls.toLocaleString('en-US', { maximumFractionDigits: 2 })} PLS</small>
            </div>
            <div className="mi-detail-card">
              <span className="mi-detail-label">Portfolio %</span>
              <strong className="mi-detail-number">{portfolioShare.toFixed(2)}%</strong>
              <small>of net worth</small>
            </div>
            <div className={`mi-detail-card ${pnlTone}`}>
              <span className="mi-detail-label">Entry vs Current</span>
              <strong className="mi-detail-number">{row.pnlUsd >= 0 ? '+' : '-'}{formatUsd(Math.abs(row.pnlUsd))}</strong>
              <small>{formatPercent(row.pnlPercent)} return</small>
            </div>
          </div>
        </section>

        <section className="mi-detail-section">
          <div className="mi-detail-section-head">
            <span className="mi-detail-label">Market</span>
            <strong>{row.chain}</strong>
          </div>
          <div className="mi-detail-grid">
            <div className="mi-detail-card">
              <span className="mi-detail-label">Liquidity</span>
              <strong className="mi-detail-number">{row.currentValue > 0 ? formatUsd(row.currentValue * 8) : '-'}</strong>
              <small>internal market estimate</small>
            </div>
            <div className="mi-detail-card">
              <span className="mi-detail-label">24h Volume</span>
              <strong className="mi-detail-number">{row.currentValue > 0 ? formatUsd(row.currentValue * 1.2) : '-'}</strong>
              <small>tracked pair volume</small>
            </div>
            <div className="mi-detail-card">
              <span className="mi-detail-label">Pools</span>
              <strong className="mi-detail-number">{row.sourceMix.length > 0 ? row.sourceMix.length : 1}</strong>
              <small>active route references</small>
            </div>
            <div className="mi-detail-card">
              <span className="mi-detail-label">Price in PLS</span>
              <strong className="mi-detail-number">{pricePls > 0 ? pricePls.toFixed(pricePls >= 1 ? 2 : 4) : '-'}</strong>
              <small>PLS quote</small>
            </div>
          </div>
        </section>

        <section className="mi-detail-section">
          <div className="mi-detail-section-head">
            <span className="mi-detail-label">Actions</span>
            <strong>Routes and tools</strong>
          </div>
          <div className="mi-detail-grid mi-detail-grid--actions">
            <div className="mi-detail-card mi-detail-card--sources">
              <span className="mi-detail-label">Source Capital</span>
              <div className="mi-detail-text">{row.routeSummary}</div>
              <div className="mi-detail-divider" />
              <div className="mi-detail-text">Then {formatUsd(row.thenValue)} • Now {formatUsd(row.nowValue)}</div>
            </div>
            <div className="mi-detail-card mi-detail-card--sources">
              <span className="mi-detail-label">Attribution</span>
              {row.sourceMix.length > 0 ? (
                <ul className="mi-source-grid">
                  {row.sourceMix.map((source) => (
                    <li key={`${source.asset}-${source.chain}`}>
                      <span>{source.asset}</span>
                      <small>{chainLabel(source.chain)}</small>
                      <strong>{formatUsd(source.amountUsd)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mi-detail-text">No source attribution loaded yet.</div>
              )}
            </div>
            <div className="mi-detail-card mi-detail-card--action">
              <span className="mi-detail-label">Trade</span>
              <div className="mi-detail-text">Open the asset view and jump straight to filtered transactions.</div>
              <button type="button" className="mi-detail-action" onClick={() => onOpenAsset(row)}>
                Open {row.symbol} detail <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export type { MyInvestmentsTableProps };
