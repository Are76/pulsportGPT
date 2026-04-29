import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HexStake } from '../types';

interface StakingLadderProps {
  stakes: HexStake[];
}

/**
 * Bar chart showing HEX stake distribution bucketed into 30-day end-date windows.
 * Adapted from the pulsechain-dashboard reference implementation.
 */
export function StakingLadder({ stakes }: StakingLadderProps) {
  if (!stakes || stakes.length === 0) return null;

  const bucketSize = 30;
  const buckets: Record<
    number,
    { totalShares: number; stakeCount: number; bucketRange: string }
  > = {};

  stakes.forEach((stake) => {
    const days = Math.max(0, Math.min(5555, Math.floor(stake.daysRemaining ?? 0)));
    const bucketIdx = Math.floor(days / bucketSize);
    if (!buckets[bucketIdx]) {
      const start = bucketIdx * bucketSize;
      // Use 0.001 as a sentinel so that buckets that are initialised but have
      // no shares yet (totalShares === 0.001) are not confused with genuinely
      // empty bucket entries (which are never added to the map).
      buckets[bucketIdx] = {
        totalShares: 0.001,
        stakeCount: 0,
        bucketRange: `${start}-${start + bucketSize - 1}`,
      };
    }
    buckets[bucketIdx].totalShares =
      (buckets[bucketIdx].totalShares === 0.001 ? 0 : buckets[bucketIdx].totalShares) +
      (stake.tShares ?? 0);
    buckets[bucketIdx].stakeCount += 1;
  });

  const chartData = Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([idx, d]) => ({
      daysRemaining: Number(idx) * bucketSize + bucketSize / 2,
      ...d,
    }));

  const CustomTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="chart-tooltip" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>
          Days: {d.bucketRange}
        </div>
        <div>T-Shares: {d.totalShares.toFixed(2)}</div>
        <div>Stakes: {d.stakeCount}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 18px 10px',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 14,
          color: 'var(--fg-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '.6px',
        }}
      >
        Staking Ladder
      </div>
      <ResponsiveContainer width="100%" height={220} minWidth={1} minHeight={1}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="daysRemaining"
            tick={{ fill: 'var(--fg-subtle)', fontSize: 13 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            label={{
              value: 'Days Remaining',
              position: 'insideBottom',
              offset: -10,
              fill: 'var(--fg-subtle)',
              fontSize: 13,
            }}
          />
          <YAxis
            tick={{ fill: 'var(--fg-subtle)', fontSize: 13 }}
            axisLine={false}
            tickLine={false}
            scale="log"
            domain={['auto', 'auto']}
            allowDataOverflow={false}
          />
          <RechartsTooltip content={<CustomTip />} />
          <Bar dataKey="totalShares" fill="#00FF9F" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
