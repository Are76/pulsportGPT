import { fmtUsd } from '../../lib/utils';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';
import { buildBehaviorMetricDescriptor } from '../../features/provenance/builders';
import { ProvenanceTrigger } from '../../features/provenance/ProvenancePopover';

export function TradeBehaviorCard({ behavior }: { behavior: WalletAnalyzerModel['behavior'] }) {
  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Behavior</p>
          <h2 className="wa-title">Trade behavior</h2>
          <p className="wa-panel__description">How long positions are held and whether results are coming from closed trades or open exposure.</p>
        </div>
      </div>
      <div className="wa-behavior-grid">
        <article className="wa-behavior-card">
          <span>Average holding period</span>
          <strong>
            <ProvenanceTrigger
              descriptor={buildBehaviorMetricDescriptor(
                'Average holding period',
                `${behavior.averageHoldingPeriodDays.toFixed(1)} days`,
                'Average holding period is calculated from normalized transaction lots and realized exits.',
                [
                  { label: 'Average hold', value: `${behavior.averageHoldingPeriodDays.toFixed(1)} days` },
                  { label: 'Realized sales', value: String(behavior.realizedSalesCount) },
                ],
              )}
            >
              {behavior.averageHoldingPeriodDays.toFixed(1)} days
            </ProvenanceTrigger>
          </strong>
        </article>
        <article className="wa-behavior-card">
          <span>Realized gains</span>
          <strong className={behavior.realizedGainUsd >= 0 ? 'wa-value-up' : 'wa-value-down'}>
            <ProvenanceTrigger
              descriptor={buildBehaviorMetricDescriptor(
                'Realized gains',
                fmtUsd(behavior.realizedGainUsd),
                'Realized gains sum the P&L from closed transaction lots only.',
                [
                  { label: 'Closed sales', value: String(behavior.realizedSalesCount) },
                  { label: 'Realized P&L', value: fmtUsd(behavior.realizedGainUsd) },
                ],
              )}
            >
              {fmtUsd(behavior.realizedGainUsd)}
            </ProvenanceTrigger>
          </strong>
        </article>
        <article className="wa-behavior-card">
          <span>Unrealized gains</span>
          <strong className={behavior.unrealizedGainUsd >= 0 ? 'wa-value-up' : 'wa-value-down'}>
            <ProvenanceTrigger
              descriptor={buildBehaviorMetricDescriptor(
                'Unrealized gains',
                fmtUsd(behavior.unrealizedGainUsd),
                'Unrealized gains compare current marked values against remaining open lot cost basis.',
                [
                  { label: 'Unrealized P&L', value: fmtUsd(behavior.unrealizedGainUsd) },
                  { label: 'Open exposure', value: behavior.unrealizedGainUsd >= 0 ? 'Net gain' : 'Net loss' },
                ],
              )}
            >
              {fmtUsd(behavior.unrealizedGainUsd)}
            </ProvenanceTrigger>
          </strong>
        </article>
        <article className="wa-behavior-card">
          <span>Closed sales</span>
          <strong>
            <ProvenanceTrigger
              descriptor={buildBehaviorMetricDescriptor(
                'Closed sales',
                String(behavior.realizedSalesCount),
                'Closed sales count the realized exit transactions used in the behavior model.',
                [{ label: 'Realized sale count', value: String(behavior.realizedSalesCount) }],
              )}
            >
              {behavior.realizedSalesCount}
            </ProvenanceTrigger>
          </strong>
        </article>
      </div>
    </section>
  );
}
