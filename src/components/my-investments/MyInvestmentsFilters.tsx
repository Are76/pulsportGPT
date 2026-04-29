interface MyInvestmentsFiltersProps {
  activeFilter: 'all' | 'pulsechain' | 'ethereum' | 'base';
  counts: Record<'all' | 'pulsechain' | 'ethereum' | 'base', number>;
  onChange: (filter: 'all' | 'pulsechain' | 'ethereum' | 'base') => void;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pulsechain', label: 'PulseChain' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'base', label: 'Base' },
] as const;

export function MyInvestmentsFilters({ activeFilter, counts, onChange }: MyInvestmentsFiltersProps) {
  return (
    <div className="mi-filters-wrap">
      <div className="mi-section-heading">
        <div>
          <p className="mi-section-kicker">Current Bag</p>
          <h2>Holdings Attribution</h2>
        </div>
        <p>Filter the live bag by chain, then open a row for source capital, P&amp;L, and route context.</p>
      </div>
      <div className="mi-filters" role="tablist" aria-label="Chain filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={activeFilter === filter.id ? 'is-active' : ''}
            aria-pressed={activeFilter === filter.id}
            onClick={() => onChange(filter.id)}
          >
            <span>{filter.label}</span>
            <small>{counts[filter.id]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { MyInvestmentsFiltersProps };
