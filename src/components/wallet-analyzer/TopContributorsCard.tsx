import { fmtUsd } from '../../lib/utils';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';
import { buildHoldingMoveDescriptor } from '../../features/provenance/builders';
import { ProvenanceTrigger } from '../../features/provenance/ProvenancePopover';

export function TopContributorsCard({
  contributors,
  onOpenTransactions,
}: {
  contributors: WalletAnalyzerModel['contributors'];
  onOpenTransactions?: (holding: WalletAnalyzerModel['contributors']['topHoldings'][number]) => void;
}) {
  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Contributors</p>
          <h2 className="wa-title">Top contributors</h2>
          <p className="wa-panel__description">Largest positions by current value, with realized position movement from stored entry snapshots.</p>
        </div>
      </div>
      <div className="wa-contributors-list">
        {contributors.topHoldings.map((holding) => (
          <article className="wa-contributor-row" key={`${holding.chain}-${holding.id}`}>
            <div>
              <strong>{holding.symbol}</strong>
              <span>{holding.name} <em className={`wa-chain-badge wa-chain-badge--${holding.chain}`}>{holding.chain}</em></span>
            </div>
            <div>
              <strong>
                <ProvenanceTrigger
                  descriptor={buildHoldingMoveDescriptor(holding, {
                    drilldown: onOpenTransactions ? () => onOpenTransactions(holding) : undefined,
                  })}
                >
                  {fmtUsd(holding.currentValue)}
                </ProvenanceTrigger>
              </strong>
              <span className={holding.moveUsd >= 0 ? 'wa-value-up' : 'wa-value-down'}>
                <ProvenanceTrigger
                  descriptor={buildHoldingMoveDescriptor(holding, {
                    drilldown: onOpenTransactions ? () => onOpenTransactions(holding) : undefined,
                  })}
                >
                  {holding.moveUsd >= 0 ? '+' : '-'}{fmtUsd(Math.abs(holding.moveUsd))} position move
                </ProvenanceTrigger>
              </span>
            </div>
            <div className="wa-contributor-bar" aria-hidden="true">
              <div
                className="wa-contributor-bar__fill"
                data-testid={`contribution-bar-${holding.symbol}`}
                style={{ width: `${Math.max(holding.shareOfNav * 100, 4)}%` }}
              />
            </div>
            {onOpenTransactions ? (
              <button
                type="button"
                className="wa-contributor-row__action"
                onClick={() => onOpenTransactions(holding)}
              >
                View {holding.symbol} flow
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
