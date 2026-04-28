import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';
import {
  buildNumberMetricProvenance,
  buildPercentMetricProvenance,
} from '../../features/provenance/builders';
import { ProvenanceTrigger } from '../../features/provenance/ProvenancePopover';

function metric(label: string, value: string, descriptor: ReturnType<typeof buildNumberMetricProvenance>) {
  return (
    <article className="wa-stat-card" key={label}>
      <span className="wa-stat-card__label">{label}</span>
      <strong className="wa-stat-card__value">
        <ProvenanceTrigger descriptor={descriptor}>{value}</ProvenanceTrigger>
      </strong>
    </article>
  );
}

export function RiskMetricsPanel({
  nav,
  risk,
}: {
  nav: WalletAnalyzerModel['nav'];
  risk: WalletAnalyzerModel['risk'];
}) {
  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Risk</p>
          <h2 className="wa-title">Risk metrics</h2>
          <p className="wa-panel__description">Read this as fragility first: downside, instability, then risk-adjusted return.</p>
        </div>
      </div>
      <div className="wa-stat-grid">
        {metric(
          'Max drawdown',
          `${(risk.maxDrawdown * 100).toFixed(1)}%`,
          buildPercentMetricProvenance(
            'Max drawdown',
            risk.maxDrawdown,
            [{ label: 'Worst peak-to-trough move', value: `${(risk.maxDrawdown * 100).toFixed(1)}%` }],
            'Max drawdown is the largest percentage decline from a local peak to a later trough.',
          ),
        )}
        {metric(
          'Volatility',
          `${(nav.volatility * 100).toFixed(1)}%`,
          buildPercentMetricProvenance(
            'Volatility',
            nav.volatility,
            [{ label: 'Return dispersion', value: `${(nav.volatility * 100).toFixed(1)}%` }],
            'Volatility is the annualized variability of the tracked portfolio return series.',
          ),
        )}
        {metric(
          'Sharpe',
          nav.sharpeRatio.toFixed(2),
          buildNumberMetricProvenance(
            'Sharpe ratio',
            nav.sharpeRatio.toFixed(2),
            [
              { label: 'Risk-adjusted return', value: nav.sharpeRatio.toFixed(2) },
              { label: 'Volatility input', value: `${(nav.volatility * 100).toFixed(1)}%` },
            ],
            'Sharpe ratio = average return ÷ return volatility in the modeled history.',
          ),
        )}
        {metric(
          'Diversification',
          `${nav.diversificationScore.toFixed(0)}/100`,
          buildNumberMetricProvenance(
            'Diversification score',
            `${nav.diversificationScore.toFixed(0)}/100`,
            [{ label: 'Concentration-adjusted score', value: `${nav.diversificationScore.toFixed(0)}/100` }],
            'Diversification score is a concentration-adjusted summary of the current cross-chain asset mix.',
          ),
        )}
      </div>
    </section>
  );
}
