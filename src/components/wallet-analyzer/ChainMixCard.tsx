import { fmtUsd } from '../../lib/utils';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';
import type { ChainAttributionRow } from '../../utils/portfolioAnalytics';
import { buildChainMixDescriptor } from '../../features/provenance/builders';
import { ProvenanceTrigger } from '../../features/provenance/ProvenancePopover';

function formatChainLabel(chain: WalletAnalyzerModel['chainMix']['rows'][number]['chain']): string {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function ChainMixCard({
  chainMix,
  rangeLabel,
  attribution,
  onOpenTransactions,
}: {
  chainMix: WalletAnalyzerModel['chainMix'];
  rangeLabel?: string;
  attribution?: ChainAttributionRow[];
  onOpenTransactions?: (chain: WalletAnalyzerModel['chainMix']['rows'][number]['chain']) => void;
}) {
  const attributionMap = new Map((attribution ?? []).map((row) => [row.chain, row]));
  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Chains</p>
          <h2 className="wa-title">Chain mix</h2>
          <p className="wa-panel__description">Where portfolio value sits now, with actual historical chain contribution for the selected range.</p>
        </div>
      </div>
      <div className="wa-chainmix-list">
        {chainMix.rows.map((row) => (
          <article className="wa-chainmix-row" key={row.chain}>
            <div>
              <strong>{formatChainLabel(row.chain)}</strong>
              <span>
                <ProvenanceTrigger
                  descriptor={buildChainMixDescriptor(
                    row,
                    attributionMap.get(row.chain)?.moveUsd,
                    rangeLabel,
                    onOpenTransactions ? () => onOpenTransactions(row.chain) : undefined,
                  )}
                >
                  {fmtUsd(row.valueUsd)}
                </ProvenanceTrigger>
                {rangeLabel && attributionMap.has(row.chain) ? ` | ${rangeLabel} move ` : ''}
                {rangeLabel && attributionMap.has(row.chain) ? (
                  <ProvenanceTrigger
                    descriptor={buildChainMixDescriptor(
                      row,
                      attributionMap.get(row.chain)?.moveUsd,
                      rangeLabel,
                      onOpenTransactions ? () => onOpenTransactions(row.chain) : undefined,
                    )}
                  >
                    {fmtUsd(attributionMap.get(row.chain)!.moveUsd)}
                  </ProvenanceTrigger>
                ) : null}
              </span>
            </div>
            <div>
              <strong className={(attributionMap.get(row.chain)?.moveUsd ?? 0) >= 0 ? 'wa-value-up' : 'wa-value-down'}>
                <ProvenanceTrigger
                  descriptor={buildChainMixDescriptor(
                    row,
                    attributionMap.get(row.chain)?.moveUsd,
                    rangeLabel,
                    onOpenTransactions ? () => onOpenTransactions(row.chain) : undefined,
                  )}
                >
                  {(row.weight * 100).toFixed(1)}%
                </ProvenanceTrigger>
              </strong>
            </div>
            <div className="wa-chainmix-bar" aria-hidden="true">
              <div
                className="wa-chainmix-bar__fill"
                data-testid={`chain-bar-${row.chain}`}
                style={{ width: `${Math.max(row.weight * 100, 4)}%` }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
