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
  return (
    <section className="mi-hero">
      <div className="mi-hero-copy">
        <p className="mi-label">Invested Fiat</p>
        <h1 className="mi-hero-value">{formatUsd(props.investedFiat)}</h1>
        <div className="mi-hero-metrics">
          <span>Current Value {formatUsd(props.currentValue)}</span>
          <span>Net P&amp;L {formatSignedUsd(props.pnlUsd)} ({formatSignedPercent(props.pnlPercent)})</span>
          <span>Liquid {formatUsd(props.liquidValue)}</span>
          <span>Staked {formatUsd(props.stakedValue)}</span>
        </div>
      </div>
      <button type="button" className="mi-planner-button" onClick={props.onOpenPlanner}>
        Profit Planner
      </button>
    </section>
  );
}

export type { MyInvestmentsHeroProps };
