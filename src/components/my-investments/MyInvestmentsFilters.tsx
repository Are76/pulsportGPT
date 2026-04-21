export function MyInvestmentsFilters() {
  return (
    <div className="mi-filters-wrap">
      <div className="mi-section-heading">
        <div>
          <p className="mi-section-kicker">Current Bag</p>
          <h2>Holdings Attribution</h2>
        </div>
        <p>Sorted by current value, with source capital available on demand.</p>
      </div>
      <div className="mi-filters" role="tablist" aria-label="Chain filters">
        <button type="button" className="is-active">All</button>
        <button type="button">PulseChain</button>
        <button type="button">Ethereum</button>
        <button type="button">Base</button>
      </div>
    </div>
  );
}
