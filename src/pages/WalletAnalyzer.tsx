import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Activity } from 'lucide-react';
import { MyInvestmentsAssetPanel } from '../components/my-investments/MyInvestmentsAssetPanel';
import { MyInvestmentsFilters } from '../components/my-investments/MyInvestmentsFilters';
import { MyInvestmentsTable } from '../components/my-investments/MyInvestmentsTable';
import { AllocationBreakdownCard } from '../components/wallet-analyzer/AllocationBreakdownCard';
import { ChainMixCard } from '../components/wallet-analyzer/ChainMixCard';
import { PortfolioPerformanceChart } from '../components/wallet-analyzer/PortfolioPerformanceChart';
import { RiskMetricsPanel } from '../components/wallet-analyzer/RiskMetricsPanel';
import { TopContributorsCard } from '../components/wallet-analyzer/TopContributorsCard';
import { TradeBehaviorCard } from '../components/wallet-analyzer/TradeBehaviorCard';
import { buildAssetHistoryIntent } from '../features/history/historyDrilldown';
import {
  buildChainMixDescriptor,
  buildHoldingMoveDescriptor,
  buildNavProvenance,
  buildNumberMetricProvenance,
  buildPercentMetricProvenance,
} from '../features/provenance/builders';
import { ProvenanceTrigger } from '../features/provenance/ProvenancePopover';
import type { WalletAnalyzerPageProps } from '../features/wallet-analyzer/walletAnalyzerTypes';
import { fmtUsd } from '../lib/utils';
import { calculateBenchmarkComparison, calculateChainAttribution } from '../utils/portfolioAnalytics';
import '../styles/wallet-analyzer.css';

type PerformanceRange = '1W' | '1M' | 'ALL';
type InvestmentChainFilter = 'all' | 'pulsechain' | 'ethereum' | 'base';

const RANGE_LIMITS: Record<PerformanceRange, number | null> = {
  '1W': 7,
  '1M': 30,
  ALL: null,
};

function formatRangeLabel(range: PerformanceRange): string {
  return range === 'ALL' ? 'All-time' : range;
}

function formatSignedPercent(value: number): string {
  const percent = (value * 100).toFixed(1);
  return `${value >= 0 ? '+' : ''}${percent}%`;
}

function formatSignedUsd(value: number): string {
  const formatted = fmtUsd(Math.abs(value));
  return `${value >= 0 ? '+' : '-'}${formatted}`;
}

export function WalletAnalyzerPage({
  model,
  investmentRows,
  plsUsdPrice,
  onOpenTransactions,
  onOpenTransactionsForHolding,
  onOpenTransactionsForChain,
}: WalletAnalyzerPageProps) {
  const [performanceRange, setPerformanceRange] = useState<PerformanceRange>('1M');
  const [holdingChainFilter, setHoldingChainFilter] = useState<InvestmentChainFilter>('all');
  const [expandedHoldingId, setExpandedHoldingId] = useState<string | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<(typeof investmentRows)[number] | null>(null);
  const filteredPerformance = useMemo(() => {
    const limit = RANGE_LIMITS[performanceRange];
    const points =
      limit == null || model.performance.points.length <= limit
        ? model.performance.points
        : model.performance.points.slice(-limit);
    const benchmarkPoints =
      limit == null || model.performance.benchmarkPoints.length <= limit
        ? model.performance.benchmarkPoints
        : model.performance.benchmarkPoints.slice(-limit);
    const comparison = calculateBenchmarkComparison(
      points,
      benchmarkPoints.map((point) => ({
        timestamp: point.timestamp,
        value: point.value,
        nativeValue: 0,
        pnl: 0,
      })),
    );

    return {
      points,
      benchmarkPoints,
      comparison,
    };
  }, [model.performance, performanceRange]);
  const rangeSummary = useMemo(() => {
    const label = formatRangeLabel(performanceRange);
    return {
      label,
      portfolioReturn: filteredPerformance.comparison.portfolioReturn,
      benchmarkReturn: filteredPerformance.comparison.benchmarkReturn,
      excessReturn: filteredPerformance.comparison.excessReturn,
    };
  }, [filteredPerformance.comparison, performanceRange]);
  const chainAttribution = useMemo(
    () =>
      calculateChainAttribution(
        filteredPerformance.points,
        model.chainMix.rows.reduce<Record<'pulsechain' | 'ethereum' | 'base', number>>(
          (acc, row) => {
            acc[row.chain] = row.valueUsd;
            return acc;
          },
          { pulsechain: 0, ethereum: 0, base: 0 },
        ),
      ),
    [filteredPerformance.points, model.chainMix.rows],
  );
  const dominantChainMove = chainAttribution[0];
  const weakestChainMove = [...chainAttribution].sort((a, b) => a.moveUsd - b.moveUsd)[0];
  const largestHoldingMove = [...model.contributors.topHoldings].sort(
    (a, b) => Math.abs(b.moveUsd) - Math.abs(a.moveUsd),
  )[0];
  const behaviorSignal =
    Math.abs(model.behavior.unrealizedGainUsd) >= Math.abs(model.behavior.realizedGainUsd)
      ? 'Open positions still drive the result.'
      : 'Closed trades are carrying more of the score.';
  const holdingChainCounts = useMemo(
    () => ({
      all: investmentRows.length,
      pulsechain: investmentRows.filter((row) => row.chain === 'pulsechain').length,
      ethereum: investmentRows.filter((row) => row.chain === 'ethereum').length,
      base: investmentRows.filter((row) => row.chain === 'base').length,
    }),
    [investmentRows],
  );
  const filteredHoldingRows = useMemo(
    () =>
      holdingChainFilter === 'all'
        ? investmentRows
        : investmentRows.filter((row) => row.chain === holdingChainFilter),
    [holdingChainFilter, investmentRows],
  );

  const visibleHoldingIds = useMemo(
    () => new Set(filteredHoldingRows.map((row) => row.id)),
    [filteredHoldingRows],
  );

  useEffect(() => {
    if (expandedHoldingId && !visibleHoldingIds.has(expandedHoldingId)) {
      setExpandedHoldingId(null);
    }
  }, [expandedHoldingId, visibleHoldingIds]);

  useEffect(() => {
    if (selectedHolding && !visibleHoldingIds.has(selectedHolding.id)) {
      setSelectedHolding(null);
    }
  }, [selectedHolding, visibleHoldingIds]);

  return (
    <div className="wa-page">
      <section className="wa-hero">
        <div>
          <p className="wa-kicker">Analyzer</p>
          <h1 className="wa-hero__title">Wallet Analyzer</h1>
          <p className="wa-hero__copy">Performance, risk, and behavior analytics across the tracked portfolio.</p>
        </div>
        <div className="wa-hero__stats">
          <article className="wa-hero__stat">
            <span>NAV</span>
            <strong>
              <ProvenanceTrigger descriptor={buildNavProvenance(model.nav.totalValue)}>
                {fmtUsd(model.nav.totalValue)}
              </ProvenanceTrigger>
            </strong>
          </article>
          <article className="wa-hero__stat">
            <span>Cumulative return</span>
            <strong>
              <ProvenanceTrigger
                descriptor={buildPercentMetricProvenance(
                  'Cumulative return',
                  model.nav.cumulativeReturn,
                  [
                    { label: 'Portfolio return', value: `${(model.nav.cumulativeReturn * 100).toFixed(1)}%` },
                    { label: 'Benchmark return', value: `${(model.performance.comparison.benchmarkReturn * 100).toFixed(1)}%` },
                  ],
                  'Cumulative return is taken from the current analyzer history window and reflects total modeled portfolio return.',
                )}
              >
                {(model.nav.cumulativeReturn * 100).toFixed(1)}%
              </ProvenanceTrigger>
            </strong>
          </article>
          <article className="wa-hero__stat">
            <span>Diversification</span>
            <strong>
              <ProvenanceTrigger
                descriptor={buildNumberMetricProvenance(
                  'Diversification score',
                  `${model.nav.diversificationScore.toFixed(0)}/100`,
                  [{ label: 'Current diversification score', value: `${model.nav.diversificationScore.toFixed(0)}/100` }],
                  'Diversification score compresses the current asset concentration profile into a 0-100 scale.',
                )}
              >
                {model.nav.diversificationScore.toFixed(0)}/100
              </ProvenanceTrigger>
            </strong>
          </article>
        </div>
      </section>

      {model.alerts.length > 0 ? (
        <section className="wa-alerts" aria-label="Analyzer alerts">
          {model.alerts.map((alert) => (
            <article className={`wa-alert wa-alert--${alert.tone}`} key={alert.id}>
              {alert.tone === 'warning' ? <AlertTriangle size={16} /> : <Activity size={16} />}
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="wa-story-grid" aria-label="Analyzer highlights">
        <article className="wa-story-card wa-story-card--accent">
          <span className="wa-story-card__label">{rangeSummary.label} alpha</span>
          <strong className="wa-story-card__value">
            <ProvenanceTrigger
              descriptor={buildPercentMetricProvenance(
                `${rangeSummary.label} alpha`,
                rangeSummary.excessReturn,
                [
                  { label: 'Portfolio return', value: formatSignedPercent(rangeSummary.portfolioReturn) },
                  { label: 'Benchmark return', value: formatSignedPercent(rangeSummary.benchmarkReturn) },
                ],
                'Alpha = selected-range portfolio return minus selected-range benchmark return.',
              )}
            >
              {formatSignedPercent(rangeSummary.excessReturn)}
            </ProvenanceTrigger>
          </strong>
          <p className="wa-story-card__copy">
            Portfolio return {formatSignedPercent(rangeSummary.portfolioReturn)} versus benchmark {formatSignedPercent(rangeSummary.benchmarkReturn)}.
          </p>
        </article>
        <article className="wa-story-card">
          <span className="wa-story-card__label">Chain driver</span>
          <strong className="wa-story-card__value">
            {dominantChainMove ? (
              <ProvenanceTrigger
                descriptor={buildChainMixDescriptor(
                  model.chainMix.rows.find((row) => row.chain === dominantChainMove.chain) ?? {
                    chain: dominantChainMove.chain,
                    valueUsd: 0,
                    weight: 0,
                  },
                  dominantChainMove.moveUsd,
                  rangeSummary.label,
                  () => onOpenTransactionsForChain(dominantChainMove.chain),
                )}
              >
                {dominantChainMove.chain}
              </ProvenanceTrigger>
            ) : (
              'Portfolio'
            )}
          </strong>
          <p className="wa-story-card__copy">
            {dominantChainMove
              ? `${rangeSummary.label} move ${formatSignedUsd(dominantChainMove.moveUsd)} on the strongest chain contribution.`
              : 'No chain split available for the selected range.'}
          </p>
        </article>
        <article className="wa-story-card">
          <span className="wa-story-card__label">Behavior signal</span>
          <strong className="wa-story-card__value">
            <ProvenanceTrigger
              descriptor={buildNumberMetricProvenance(
                'Behavior signal holding period',
                `${model.behavior.averageHoldingPeriodDays.toFixed(1)}d`,
                [
                  { label: 'Average holding period', value: `${model.behavior.averageHoldingPeriodDays.toFixed(1)} days` },
                  { label: 'Realized sales', value: String(model.behavior.realizedSalesCount) },
                ],
                'This signal highlights the average hold duration used in the behavior model.',
              )}
            >
              {model.behavior.averageHoldingPeriodDays.toFixed(1)}d
            </ProvenanceTrigger>
          </strong>
          <p className="wa-story-card__copy">{behaviorSignal}</p>
        </article>
      </section>

      <div className="wa-main-grid">
        <div className="wa-main-grid__primary">
          <PortfolioPerformanceChart
            performance={filteredPerformance}
            summary={rangeSummary}
            controls={
              <div className="wa-segmented-control" aria-label="Performance range">
                {(['1W', '1M', 'ALL'] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    className="wa-segmented-control__button"
                    aria-pressed={performanceRange === range}
                    onClick={() => setPerformanceRange(range)}
                  >
                    {range === 'ALL' ? 'All' : range}
                  </button>
                ))}
              </div>
            }
          />
          <ChainMixCard
            chainMix={model.chainMix}
            rangeLabel={rangeSummary.label}
            attribution={chainAttribution}
            onOpenTransactions={onOpenTransactionsForChain}
          />
        </div>
        <div className="wa-main-grid__secondary">
          <RiskMetricsPanel nav={model.nav} risk={model.risk} />
          <TradeBehaviorCard behavior={model.behavior} />
        </div>
      </div>

      <section className="wa-change-band wa-panel" aria-label="What changed this range">
        <div className="wa-panel__head">
          <div>
            <p className="wa-kicker">Range Change</p>
            <h2 className="wa-title">What changed this range</h2>
            <p className="wa-panel__description">
              A focused read on the selected window before you inspect the deeper attribution cards.
            </p>
          </div>
        </div>
        <div className="wa-change-grid">
          <article className="wa-change-card wa-change-card--accent">
            <span className="wa-change-card__label">{rangeSummary.label} portfolio move</span>
            <strong className="wa-change-card__value">
              <ProvenanceTrigger
                descriptor={buildPercentMetricProvenance(
                  `${rangeSummary.label} portfolio move`,
                  rangeSummary.portfolioReturn,
                  [
                    { label: 'Portfolio return', value: formatSignedPercent(rangeSummary.portfolioReturn) },
                    { label: 'Benchmark return', value: formatSignedPercent(rangeSummary.benchmarkReturn) },
                  ],
                  'Selected-range move is the modeled portfolio return over the currently selected analyzer range.',
                )}
              >
                {formatSignedPercent(rangeSummary.portfolioReturn)}
              </ProvenanceTrigger>
            </strong>
            <p className="wa-change-card__copy">
              Alpha landed at {formatSignedPercent(rangeSummary.excessReturn)} against the current benchmark track.
            </p>
          </article>
          <article className="wa-change-card">
            <span className="wa-change-card__label">Strongest chain</span>
            <strong className="wa-change-card__value">
              {dominantChainMove ? (
                <ProvenanceTrigger
                  descriptor={buildChainMixDescriptor(
                    model.chainMix.rows.find((row) => row.chain === dominantChainMove.chain) ?? {
                      chain: dominantChainMove.chain,
                      valueUsd: 0,
                      weight: 0,
                    },
                    dominantChainMove.moveUsd,
                    rangeSummary.label,
                    () => onOpenTransactionsForChain(dominantChainMove.chain),
                  )}
                >
                  {dominantChainMove.chain}
                </ProvenanceTrigger>
              ) : 'N/A'}
            </strong>
            <p className="wa-change-card__copy">
              {dominantChainMove
                ? `${rangeSummary.label} contribution ${formatSignedUsd(dominantChainMove.moveUsd)}.`
                : 'No chain contribution data is available.'}
            </p>
            {dominantChainMove ? (
              <button
                type="button"
                className="wa-change-card__action"
                onClick={() => onOpenTransactionsForChain(dominantChainMove.chain)}
              >
                Open strongest chain
              </button>
            ) : null}
          </article>
          <article className="wa-change-card">
            <span className="wa-change-card__label">Largest position move</span>
            <strong className="wa-change-card__value">
              {largestHoldingMove ? (
                <ProvenanceTrigger
                  descriptor={buildHoldingMoveDescriptor(largestHoldingMove, {
                    drilldown: () => onOpenTransactionsForHolding(largestHoldingMove),
                  })}
                >
                  {largestHoldingMove.symbol}
                </ProvenanceTrigger>
              ) : 'N/A'}
            </strong>
            <p className="wa-change-card__copy">
              {largestHoldingMove
                ? `${formatSignedUsd(largestHoldingMove.moveUsd)} from stored position snapshots.`
                : 'No position movement is available.'}
            </p>
            {largestHoldingMove ? (
              <button
                type="button"
                className="wa-change-card__action"
                onClick={() => onOpenTransactionsForHolding(largestHoldingMove)}
              >
                Open largest position move
              </button>
            ) : null}
          </article>
          <article className="wa-change-card">
            <span className="wa-change-card__label">Weakest chain</span>
            <strong className="wa-change-card__value">
              {weakestChainMove ? (
                <ProvenanceTrigger
                  descriptor={buildChainMixDescriptor(
                    model.chainMix.rows.find((row) => row.chain === weakestChainMove.chain) ?? {
                      chain: weakestChainMove.chain,
                      valueUsd: 0,
                      weight: 0,
                    },
                    weakestChainMove.moveUsd,
                    rangeSummary.label,
                    () => onOpenTransactionsForChain(weakestChainMove.chain),
                  )}
                >
                  {weakestChainMove.chain}
                </ProvenanceTrigger>
              ) : 'N/A'}
            </strong>
            <p className="wa-change-card__copy">
              {weakestChainMove
                ? `${rangeSummary.label} drag ${formatSignedUsd(weakestChainMove.moveUsd)}.`
                : 'No negative chain contribution is available.'}
            </p>
            {weakestChainMove ? (
              <button
                type="button"
                className="wa-change-card__action"
                onClick={() => onOpenTransactionsForChain(weakestChainMove.chain)}
              >
                Open weakest chain
              </button>
            ) : null}
          </article>
        </div>
      </section>

      <div className="wa-main-grid wa-main-grid--lower">
        <div className="wa-main-grid__primary">
          <section className="wa-panel wa-panel--holdings">
            <div className="wa-holdings-shell">
              <MyInvestmentsFilters
                activeFilter={holdingChainFilter}
                counts={holdingChainCounts}
                onChange={setHoldingChainFilter}
              />
              <MyInvestmentsTable
                rows={filteredHoldingRows}
                plsUsdPrice={plsUsdPrice}
                portfolioValue={model.nav.totalValue}
                expandedId={expandedHoldingId}
                onToggleRow={(id) => setExpandedHoldingId((current) => current === id ? null : id)}
                onOpenAsset={setSelectedHolding}
                onOpenTransactions={(row) => onOpenTransactions(buildAssetHistoryIntent(row))}
              />
            </div>
          </section>
        </div>
        <div className="wa-main-grid__secondary">
          <AllocationBreakdownCard
            allocation={model.allocation}
            onOpenTransactions={onOpenTransactionsForHolding}
          />
          <TopContributorsCard
            contributors={model.contributors}
            onOpenTransactions={onOpenTransactionsForHolding}
          />
        </div>
      </div>
      {selectedHolding ? (
        <MyInvestmentsAssetPanel
          row={selectedHolding}
          onClose={() => setSelectedHolding(null)}
          onOpenTransactions={(row) => onOpenTransactions(buildAssetHistoryIntent(row))}
        />
      ) : null}
    </div>
  );
}
