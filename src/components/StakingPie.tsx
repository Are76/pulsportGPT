import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { fmtCompact } from '../utils/format';
import type { HexStake } from '../types';

interface StakingPieProps {
  stakes: HexStake[];
  hexUsdPrice: number;
}

const GRADIENT = ['#00FF9F', '#627EEA', '#f739ff', '#fb923c', '#3b82f6', '#a855f7'];
const getColor = (i: number) => GRADIENT[i % GRADIENT.length];

/**
 * Donut chart showing HEX stake distribution grouped by wallet.
 * Wallets below 2 % of total T-Shares are collapsed into an "Others" slice.
 */
export function StakingPie({ stakes, hexUsdPrice }: StakingPieProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  if (!stakes || stakes.length === 0) return null;

  const byWallet: Record<
    string,
    { label: string; tShares: number; stakedHex: number; yieldHex: number; totalHex: number; totalUsd: number; count: number }
  > = {};

  stakes.forEach((s) => {
    const key = s.walletAddress ?? s.id;
    const label = s.walletLabel ?? key.slice(0, 8) + '...';
    if (!byWallet[key]) {
      byWallet[key] = { label, tShares: 0, stakedHex: 0, yieldHex: 0, totalHex: 0, totalUsd: 0, count: 0 };
    }
    const tsh = s.tShares ?? 0;
    const staked = s.stakedHex ?? 0;
    const yld = s.stakeHexYield ?? 0;
    byWallet[key].tShares += tsh;
    byWallet[key].stakedHex += staked;
    byWallet[key].yieldHex += yld;
    byWallet[key].totalHex += staked + yld;
    byWallet[key].totalUsd += (staked + yld) * hexUsdPrice;
    byWallet[key].count += 1;
  });

  const totalTShares = Object.values(byWallet).reduce((a, b) => a + b.tShares, 0);
  const totalUsd = Object.values(byWallet).reduce((a, b) => a + b.totalUsd, 0);
  const totalHex = Object.values(byWallet).reduce((a, b) => a + b.totalHex, 0);

  const sorted = Object.values(byWallet).sort((a, b) => b.tShares - a.tShares);
  const threshold = 0.02;
  const large = sorted.filter((w) => w.tShares / totalTShares >= threshold);
  const small = sorted.filter((w) => w.tShares / totalTShares < threshold);
  const chartData =
    small.length > 0
      ? [
          ...large,
          {
            label: 'Others',
            tShares: small.reduce((a, b) => a + b.tShares, 0),
            totalUsd: small.reduce((a, b) => a + b.totalUsd, 0),
            count: small.reduce((a, b) => a + b.count, 0),
          },
        ]
      : large;

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
      <g>
        <text x={cx} y={cy - 14} textAnchor="middle" fill="var(--fg-subtle)" fontSize="12">
          {payload.label}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--fg)" fontSize="18" fontWeight="700">
          {fmtCompact(payload.tShares)}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="var(--fg-subtle)" fontSize="11">
          T-Shares
        </text>
        <Pie
          data={[]}
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 6}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          dataKey="value"
        />
      </g>
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
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--fg-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '.6px',
          }}
        >
          Stake Distribution
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          <span style={{ color: 'var(--fg)', fontWeight: 700 }}>${fmtCompact(totalUsd)}</span>
          {'  -  '}
          <span style={{ color: '#fb923c' }}>{fmtCompact(totalHex)} HEX</span>
          {'  -  '}
          <span style={{ color: 'var(--accent)' }}>{fmtCompact(totalTShares)} T-Shares</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={1}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={85}
            dataKey="tShares"
            activeIndex={activeIndex}
            activeShape={renderActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={getColor(i)} />
            ))}
          </Pie>
          <RechartsTooltip
            formatter={(val: any, _: any, entry: any) => [
              `${fmtCompact(Number(val))} T-Shares  -  $${fmtCompact(entry.payload.totalUsd)}`,
              entry.payload.label,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 4 }}>
        {chartData.map((w, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-muted)' }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getColor(i),
                flexShrink: 0,
              }}
            />
            <span>{w.label}</span>
            <span style={{ color: 'var(--fg-subtle)' }}>({w.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
