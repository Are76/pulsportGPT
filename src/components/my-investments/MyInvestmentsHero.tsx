interface MyInvestmentsHeroProps {
  investedFiat: number;
  currentValue: number;
  pnlUsd: number;
  pnlPercent: number;
  liquidValue: number;
  stakedValue: number;
  onOpenPlanner: () => void;
}

const formatUsd = (value: number) => `$${value.toLocaleString('en-US')}`;
const formatSignedUsd = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString('en-US')}`;
const formatSignedPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export function MyInvestmentsHero(props: MyInvestmentsHeroProps) {
  const pnlTone = props.pnlUsd >= 0 ? 'is-positive' : 'is-negative';

  return (
    <section className="mi-hero">
      <div className="mi-hero-copy">
        <p className="mi-label">Invested Fiat</p>
        <h1 className="mi-hero-value">{formatUsd(props.investedFiat)}</h1>
        <p className="mi-hero-caption">Historical entry pricing from Ethereum and Base inflows.</p>
      </div>

      <div className="mi-hero-side">
        <div className="mi-hero-metrics">
          <article className="mi-stat-card">
            <span className="mi-stat-label">Current Value</span>
            <strong className="mi-stat-value">{formatUsd(props.currentValue)}</strong>
          </article>
          <article className={`mi-stat-card ${pnlTone}`}>
            <span className="mi-stat-label">Net P&amp;L</span>
            <strong className="mi-stat-value">{formatSignedUsd(props.pnlUsd)}</strong>
            <span className="mi-stat-meta">{formatSignedPercent(props.pnlPercent)}</span>
          </article>
          <article className="mi-stat-card mi-stat-card--compact">
            <span className="mi-stat-label">Liquid</span>
            <strong className="mi-stat-value">{formatUsd(props.liquidValue)}</strong>
          </article>
          <article className="mi-stat-card mi-stat-card--compact">
            <span className="mi-stat-label">Staked</span>
            <strong className="mi-stat-value">{formatUsd(props.stakedValue)}</strong>
          </article>
        </div>

        <button type="button" className="mi-planner-button" onClick={props.onOpenPlanner}>
          Profit Planner
        </button>
      </div>
    </section>
  );
}

export type { MyInvestmentsHeroProps };
