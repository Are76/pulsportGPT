import { fmtUsd } from '../../lib/utils';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';
import { buildHoldingValueDescriptor } from '../../features/provenance/builders';
import { ProvenanceTrigger } from '../../features/provenance/ProvenancePopover';

export function AllocationBreakdownCard({
  allocation,
  onOpenTransactions,
}: {
  allocation: WalletAnalyzerModel['allocation'];
  onOpenTransactions?: (holding: WalletAnalyzerModel['allocation']['topHoldings'][number]) => void;
}) {
  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Allocation</p>
          <h2 className="wa-title">Allocation breakdown</h2>
          <p className="wa-panel__description">Current portfolio weight by asset, sorted by largest positions first.</p>
        </div>
      </div>
      <div className="wa-allocation-list">
        {allocation.topHoldings.map((holding) => (
          <article className="wa-allocation-row" key={`${holding.chain}-${holding.symbol}`}>
            <div>
              <strong>{holding.symbol}</strong>
              <span>{holding.name} <em className={`wa-chain-badge wa-chain-badge--${holding.chain}`}>{holding.chain}</em></span>
            </div>
            <div>
              <strong>
                <ProvenanceTrigger
                  descriptor={buildHoldingValueDescriptor(holding, {
                    drilldown: onOpenTransactions ? () => onOpenTransactions(holding) : undefined,
                  })}
                >
                  {fmtUsd(holding.valueUsd)}
                </ProvenanceTrigger>
              </strong>
              <span>
                <ProvenanceTrigger
                  descriptor={buildHoldingValueDescriptor(holding, {
                    drilldown: onOpenTransactions ? () => onOpenTransactions(holding) : undefined,
                  })}
                >
                  {(holding.weight * 100).toFixed(1)}%
                </ProvenanceTrigger>
              </span>
            </div>
            <div className="wa-allocation-bar" aria-hidden="true">
              <div
                className="wa-allocation-bar__fill"
                data-testid={`allocation-bar-${holding.symbol}`}
                style={{ width: `${Math.max(holding.weight * 100, 4)}%` }}
              />
            </div>
            {onOpenTransactions ? (
              <button
                type="button"
                className="wa-allocation-row__action"
                onClick={() => onOpenTransactions(holding)}
              >
                View {holding.symbol} transactions
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
