import type { InvestmentHoldingRow } from '../../types';

interface MyInvestmentsAssetPanelProps {
  row: InvestmentHoldingRow;
  onClose: () => void;
  onOpenTransactions: (row: InvestmentHoldingRow) => void;
}

const formatUsd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function MyInvestmentsAssetPanel({ row, onClose, onOpenTransactions }: MyInvestmentsAssetPanelProps) {
  const pnlTone = row.pnlUsd >= 0 ? 'is-positive' : 'is-negative';

  return (
    <aside className="mi-asset-panel" aria-label={`${row.symbol} details`}>
      <div className="mi-asset-panel-header">
        <div>
          <p className="mi-label">Asset Detail</p>
          <h2>{row.symbol}</h2>
          <p className="mi-asset-panel-subtitle">{row.name} · {row.chain}</p>
        </div>
        <button type="button" className="mi-close-button" onClick={onClose}>Close</button>
      </div>

      <dl className="mi-asset-stats">
        <div>
          <dt>Current Value</dt>
          <dd>{formatUsd(row.currentValue)}</dd>
        </div>
        <div>
          <dt>Cost Basis</dt>
          <dd>{formatUsd(row.costBasis)}</dd>
        </div>
        <div className={pnlTone}>
          <dt>Net P&amp;L</dt>
          <dd>{row.pnlUsd >= 0 ? '+' : '-'}${Math.abs(row.pnlUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
        </div>
      </dl>

      <div className="mi-asset-panel-route">
        <span className="mi-detail-label">Investment Path</span>
        <p>{row.routeSummary}</p>
      </div>

      <button type="button" className="mi-transactions-button" onClick={() => onOpenTransactions(row)}>
        View Full Transactions
      </button>
    </aside>
  );
}

export type { MyInvestmentsAssetPanelProps };
