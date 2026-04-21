import React from 'react';
import type { InvestmentHoldingRow } from '../../types';

const formatUsd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const formatPrice = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;

interface MyInvestmentsTableProps {
  rows: InvestmentHoldingRow[];
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  onOpenAsset: (row: InvestmentHoldingRow) => void;
}

export function MyInvestmentsTable({ rows, expandedId, onToggleRow, onOpenAsset }: MyInvestmentsTableProps) {
  const sortedRows = [...rows].sort((a, b) => b.currentValue - a.currentValue);

  return (
    <div className="mi-table-shell">
      <table className="mi-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Current Price</th>
            <th>Amount</th>
            <th>Current Value</th>
            <th>Cost Basis</th>
            <th>P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const pnlTone = row.pnlUsd >= 0 ? 'is-positive' : 'is-negative';
            const isExpanded = expandedId === row.id;

            return (
              <React.Fragment key={row.id}>
                <MyInvestmentsTableRow
                  row={row}
                  isExpanded={isExpanded}
                  pnlTone={pnlTone}
                  onOpenAsset={onOpenAsset}
                  onToggleRow={onToggleRow}
                />
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MyInvestmentsTableRow({
  row,
  isExpanded,
  pnlTone,
  onOpenAsset,
  onToggleRow,
}: {
  row: InvestmentHoldingRow;
  isExpanded: boolean;
  pnlTone: string;
  onOpenAsset: (row: InvestmentHoldingRow) => void;
  onToggleRow: (id: string) => void;
}) {
  return (
    <>
      <tr className="mi-table-row">
        <td data-label="Asset">
          <button type="button" className="mi-asset-button" onClick={() => onOpenAsset(row)}>
            <span className="mi-asset-symbol">{row.symbol}</span>
            <span className="mi-asset-meta">
              {row.name}
              <span>{row.chain}</span>
            </span>
          </button>
        </td>
        <td data-label="Current Price">
          <span className="mi-data-primary">{formatPrice(row.currentPrice)}</span>
        </td>
        <td data-label="Amount">
          <span className="mi-data-primary">{row.amount.toLocaleString('en-US')}</span>
        </td>
        <td data-label="Current Value">
          <span className="mi-data-primary">{formatUsd(row.currentValue)}</span>
        </td>
        <td data-label="Cost Basis">
          <span className="mi-data-primary">{formatUsd(row.costBasis)}</span>
        </td>
        <td data-label="P&L">
          <button type="button" className={`mi-pnl-button ${pnlTone}`} onClick={() => onToggleRow(row.id)}>
            <span>{row.pnlUsd >= 0 ? '+' : '-'}${Math.abs(row.pnlUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            <span>{formatPercent(row.pnlPercent)}</span>
          </button>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="mi-expanded-row">
          <td colSpan={6}>
            <MyInvestmentsRowDetails row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MyInvestmentsRowDetails({ row }: { row: InvestmentHoldingRow }) {
  return (
    <div className="mi-row-details">
      <div className="mi-detail-block">
        <span className="mi-detail-label">Route</span>
        <p>{row.routeSummary}</p>
      </div>
      <div className="mi-detail-block">
        <span className="mi-detail-label">Source Capital</span>
        {row.sourceMix.length > 0 ? (
          <ul className="mi-source-list">
            {row.sourceMix.map((source) => (
              <li key={`${source.asset}-${source.chain}`}>
                <span className="mi-source-inline">{source.asset} · {source.chain} · {formatUsd(source.amountUsd)}</span>
                <span>{source.asset}</span>
                <span>{source.chain}</span>
                <strong>{formatUsd(source.amountUsd)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>No source attribution loaded yet.</p>
        )}
      </div>
      <div className="mi-detail-values">
        <div>
          <span className="mi-detail-label">Then</span>
          <strong>{formatUsd(row.thenValue)}</strong>
        </div>
        <div>
          <span className="mi-detail-label">Now</span>
          <strong>{formatUsd(row.nowValue)}</strong>
        </div>
      </div>
    </div>
  );
}

export type { MyInvestmentsTableProps };
