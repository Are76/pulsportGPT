import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';
import { fmtUsd } from '../../lib/utils';
import type { ReactNode } from 'react';
import { buildPercentMetricProvenance, buildPerformancePointDescriptor } from '../../features/provenance/builders';
import { ProvenanceContent, ProvenanceTrigger } from '../../features/provenance/ProvenancePopover';

export function PortfolioPerformanceChart({
  performance,
  summary,
  controls,
}: {
  performance: Pick<WalletAnalyzerModel['performance'], 'points' | 'comparison' | 'benchmarkPoints'>;
  summary?: {
    label: string;
    portfolioReturn: number;
    benchmarkReturn: number;
    excessReturn: number;
  };
  controls?: ReactNode;
}) {
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const selectedPoint =
    selectedPointIndex != null && performance.points[selectedPointIndex]
      ? buildPerformancePointDescriptor(
          performance.points[selectedPointIndex]!,
          performance.benchmarkPoints[selectedPointIndex]?.value,
        )
      : null;
  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Performance</p>
          <h2 className="wa-title">Portfolio performance</h2>
          <p className="wa-panel__description">Selected-range return versus benchmark, then the full equity curve underneath.</p>
        </div>
        <div className="wa-panel__head-actions">
          {controls}
          <div className="wa-mini-metrics">
            <span>
              <ProvenanceTrigger
                descriptor={buildPercentMetricProvenance(
                  'Portfolio return',
                  performance.comparison.portfolioReturn,
                  [{ label: 'Selected window return', value: `${(performance.comparison.portfolioReturn * 100).toFixed(1)}%` }],
                  'Portfolio return is calculated from the first and last points in the selected performance range.',
                )}
              >
                Portfolio {(performance.comparison.portfolioReturn * 100).toFixed(1)}%
              </ProvenanceTrigger>
            </span>
            <span>
              <ProvenanceTrigger
                descriptor={buildPercentMetricProvenance(
                  'Benchmark return',
                  performance.comparison.benchmarkReturn,
                  [{ label: 'Selected benchmark return', value: `${(performance.comparison.benchmarkReturn * 100).toFixed(1)}%` }],
                  'Benchmark return is calculated over the same selected range as the portfolio curve.',
                )}
              >
                Benchmark {(performance.comparison.benchmarkReturn * 100).toFixed(1)}%
              </ProvenanceTrigger>
            </span>
          </div>
        </div>
      </div>
      {summary ? (
        <div className="wa-range-summary">
          <span>
            <ProvenanceTrigger
              descriptor={buildPercentMetricProvenance(
                `${summary.label} return`,
                summary.portfolioReturn,
                [{ label: 'Portfolio return', value: `${(summary.portfolioReturn * 100).toFixed(1)}%` }],
                'Range return measures the change between the first and last points in the selected window.',
              )}
            >
              {summary.label} return {(summary.portfolioReturn * 100).toFixed(1)}%
            </ProvenanceTrigger>
          </span>
          <span>
            <ProvenanceTrigger
              descriptor={buildPercentMetricProvenance(
                `${summary.label} benchmark return`,
                summary.benchmarkReturn,
                [{ label: 'Benchmark return', value: `${(summary.benchmarkReturn * 100).toFixed(1)}%` }],
                'Benchmark return uses the modeled benchmark series over the selected range.',
              )}
            >
              Benchmark {(summary.benchmarkReturn * 100).toFixed(1)}%
            </ProvenanceTrigger>
          </span>
          <span>
            <ProvenanceTrigger
              descriptor={buildPercentMetricProvenance(
                `${summary.label} alpha`,
                summary.excessReturn,
                [
                  { label: 'Portfolio return', value: `${(summary.portfolioReturn * 100).toFixed(1)}%` },
                  { label: 'Benchmark return', value: `${(summary.benchmarkReturn * 100).toFixed(1)}%` },
                ],
                'Alpha = portfolio return − benchmark return for the selected range.',
              )}
            >
              Alpha {(summary.excessReturn * 100).toFixed(1)}%
            </ProvenanceTrigger>
          </span>
        </div>
      ) : null}
      <div className="wa-chart-legend">
        <span>Portfolio NAV</span>
        <span>Benchmark</span>
      </div>
      <button
        type="button"
        className="prov-action-button"
        onClick={() => setSelectedPointIndex(Math.max(performance.points.length - 1, 0))}
      >
        Inspect latest performance point
      </button>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
          <AreaChart
            data={performance.points.map((point, index) => ({
              ...point,
              benchmarkValue: performance.benchmarkPoints[index]?.value ?? null,
            }))}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            onClick={(state) => {
              if (typeof state?.activeTooltipIndex === 'number') {
                setSelectedPointIndex(state.activeTooltipIndex);
              }
            }}
          >
            <defs>
              <linearGradient id="wa-performance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => fmtUsd(Number(value), 0)}
            />
            <Tooltip
              formatter={(value: number) => fmtUsd(value)}
              contentStyle={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--fg)',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill="url(#wa-performance)"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="benchmarkValue"
              stroke="var(--fg-subtle)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {selectedPoint ? (
        <div className="prov-popover prov-popover--inline" role="dialog" aria-label="Performance point provenance">
          <ProvenanceContent descriptor={selectedPoint} onClose={() => setSelectedPointIndex(null)} />
        </div>
      ) : null}
    </section>
  );
}
