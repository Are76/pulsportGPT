import React, { useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Zap, Lock, Activity, Layers, Filter } from 'lucide-react';
import type { HexStake } from '../types';
import { PHEX_YIELD_PER_TSHARE, EHEX_YIELD_PER_TSHARE } from '../constants';

// -- Types ---------------------------------------------------------------------

export interface StakesSectionProps {
  stakes: HexStake[];
  hexUsdPrice: number;
  phexUsdPrice: number;
  ehexUsdPrice: number;
  liquidPHex?: number;
  liquidEHex?: number;
  walletAddresses?: string[];
  walletLabels?: Record<string, string>;
}

type StakeFilter = 'all' | 'phex' | 'ehex' | 'ending-soon' | 'matured';
type StakeChain = 'pulsechain' | 'ethereum';

// -- Helpers -------------------------------------------------------------------

function fmtHex(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtHexExact(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsdExact(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortenAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function stakeMaturityHex(st: HexStake): number {
  const tS = st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12;
  const rate = st.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
  return (st.stakedHex ?? 0) + tS * (st.stakedDays ?? 0) * rate;
}

function stakeAccruedYieldHex(st: HexStake): number {
  const tS = st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12;
  const rate = st.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
  const daysLeft = Math.max(0, st.daysRemaining ?? 0);
  const daysStakedSoFar = Math.max(0, (st.stakedDays ?? 0) - daysLeft);
  return tS * daysStakedSoFar * rate;
}

// -- StakingPie sub-component --------------------------------------------------

function StakingPie({ stakes, hexUsdPrice }: { stakes: HexStake[]; hexUsdPrice: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  if (!stakes || stakes.length === 0) return null;

  const byWallet: Record<string, { label: string; tShares: number; stakedHex: number; yieldHex: number; totalHex: number; totalUsd: number; count: number }> = {};
  stakes.forEach(s => {
    const key = s.walletAddress ?? s.id;
    const label = s.walletLabel ?? shortenAddr(key.length >= 10 ? key : s.id);
    if (!byWallet[key]) byWallet[key] = { label, tShares: 0, stakedHex: 0, yieldHex: 0, totalHex: 0, totalUsd: 0, count: 0 };
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
  const large = sorted.filter(w => totalTShares === 0 || w.tShares / totalTShares >= threshold);
  const small = sorted.filter(w => totalTShares > 0 && w.tShares / totalTShares < threshold);
  const chartData = small.length > 0
    ? [...large, { label: 'Others', tShares: small.reduce((a, b) => a + b.tShares, 0), totalUsd: small.reduce((a, b) => a + b.totalUsd, 0), count: small.reduce((a, b) => a + b.count, 0) }]
    : large;

  const GRADIENT = ['#00FF9F', '#6346FF', '#f739ff', '#fb923c', '#3b82f6', '#a855f7'];
  const getColor = (i: number) => GRADIENT[i % GRADIENT.length];

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
      <g>
        <text x={cx} y={cy - 14} textAnchor="middle" fill="var(--fg-subtle)" fontSize="12">{payload.label}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--fg)" fontSize="18" fontWeight="700">{fmtHex(payload.tShares)}</text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="var(--fg-subtle)" fontSize="11">T-Shares</text>
        <Pie data={[]} cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6}
          startAngle={startAngle} endAngle={endAngle} fill={fill} dataKey="value" />
      </g>
    );
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
          Stake Distribution
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{fmtUsd(totalUsd)}</span>
          {' - '}<span style={{ color: '#fb923c' }}>{fmtHex(totalHex)} HEX</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={1}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="tShares"
            activeIndex={activeIndex} activeShape={renderActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}>
            {chartData.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
          </Pie>
          <RechartsTooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="chart-tooltip" style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: '#00FF9F', marginBottom: 6 }}>{d.label}</div>
                  <div>T-Shares: {fmtHex(d.tShares)}</div>
                  <div>Value: {fmtUsd(d.totalUsd)}</div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// -- StakingLadder sub-component -----------------------------------------------

function StakingLadder({ stakes }: { stakes: HexStake[] }) {
  if (!stakes || stakes.length === 0) return null;
  const bucketSize = 30;
  const buckets: Record<number, { totalShares: number; stakeCount: number; bucketRange: string }> = {};

  stakes.forEach(stake => {
    const days = Math.max(0, Math.min(5555, Math.floor(stake.daysRemaining ?? 0)));
    const bucketIdx = Math.floor(days / bucketSize);
    if (!buckets[bucketIdx]) {
      const start = bucketIdx * bucketSize;
      buckets[bucketIdx] = { totalShares: 0, stakeCount: 0, bucketRange: `${start}-${start + bucketSize - 1}d` };
    }
    buckets[bucketIdx].totalShares += (stake.tShares ?? 0);
    buckets[bucketIdx].stakeCount += 1;
  });

  const chartData = Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([idx, d]) => ({ daysRemaining: Number(idx) * bucketSize + bucketSize / 2, ...d }));

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
        Staking Ladder
      </div>
      <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={1}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="daysRemaining" tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false}
            label={{ value: 'Days Remaining', position: 'insideBottom', offset: -10, fill: 'var(--fg-subtle)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'var(--fg-subtle)', fontSize: 12 }} axisLine={false} tickLine={false} scale="log" domain={['auto', 'auto']} allowDataOverflow={false} />
          <RechartsTooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="chart-tooltip" style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: '#00FF9F', marginBottom: 6 }}>Days: {d.bucketRange}</div>
                  <div>T-Shares: {d.totalShares.toFixed(2)}</div>
                  <div>Stakes: {d.stakeCount}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="totalShares" fill="rgba(99,70,255,0.75)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -- Main StakesSection component ----------------------------------------------

export function StakesSection({
  stakes,
  hexUsdPrice,
  phexUsdPrice,
  ehexUsdPrice,
  liquidPHex = 0,
  liquidEHex = 0,
  walletLabels = {},
}: StakesSectionProps) {
  const [stakeFilter, setStakeFilter] = useState<StakeFilter>('all');
  const [expandedStakeIds, setExpandedStakeIds] = useState<Set<string>>(() => new Set());

  const toggleStakeDetails = (stakeId: string) => {
    setExpandedStakeIds(prev => {
      const next = new Set(prev);
      if (next.has(stakeId)) {
        next.delete(stakeId);
      } else {
        next.add(stakeId);
      }
      return next;
    });
  };

  // -- Derived totals ----------------------------------------------------------

  const activeStakes = stakes.filter(s => (s.daysRemaining ?? 0) > 0);

  // Daily yield = sum of (tShares x chain-specific rate) across all active stakes.
  // This is independent of days remaining - it's what accrues every single day.
  const dailyYieldHex = activeStakes.reduce((sum, s) => {
    const tS = s.tShares ?? Number(s.stakeShares ?? 0n) / 1e12;
    const rate = s.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
    return sum + tS * rate;
  }, 0);
  // USD yield uses per-chain prices - pHEX and eHEX trade at different prices
  const dailyYieldUsd = activeStakes.reduce((sum, s) => {
    const tS = s.tShares ?? Number(s.stakeShares ?? 0n) / 1e12;
    const rate = s.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
    const price = s.chain === 'pulsechain' ? phexUsdPrice : ehexUsdPrice;
    return sum + tS * rate * price;
  }, 0);

  const pHexStakes = stakes.filter(s => s.chain === 'pulsechain');
  const eHexStakes = stakes.filter(s => s.chain === 'ethereum');
  const activePHexStakes = activeStakes.filter(s => s.chain === 'pulsechain');
  const activeEHexStakes = activeStakes.filter(s => s.chain === 'ethereum');

  const totalPHex = activePHexStakes.reduce((s, st) => s + (st.stakedHex ?? 0), 0);
  const totalEHex = activeEHexStakes.reduce((s, st) => s + (st.stakedHex ?? 0), 0);

  const totalHexStaked = activeStakes.reduce((s, st) => s + (st.stakedHex ?? 0), 0);
  const totalCurrentValueUsd = activeStakes.reduce((s, st) => s + (st.estimatedValueUsd ?? 0), 0);
  const totalMaturityValueUsd = activeStakes.reduce((s, st) => s + (st.totalValueUsd ?? st.estimatedValueUsd ?? 0), 0);
  const totalMaturityHex = activeStakes.reduce((s, st) => s + stakeMaturityHex(st), 0);
  const totalTShares = activeStakes.reduce((s, st) => s + (st.tShares ?? 0), 0);

  const chainPerformance = ([
    { chain: 'pulsechain' as StakeChain, label: 'PulseChain', token: 'pHEX', price: phexUsdPrice, color: 'var(--chain-pulse)', stakes: pHexStakes, liquidHex: liquidPHex },
    { chain: 'ethereum' as StakeChain, label: 'Ethereum', token: 'eHEX', price: ehexUsdPrice, color: 'var(--chain-eth)', stakes: eHexStakes, liquidHex: liquidEHex },
  ]).map(({ chain, label, token, price, color, stakes: chainStakes, liquidHex }) => {
    const active = chainStakes.filter(s => (s.daysRemaining ?? 0) > 0);
    const matured = chainStakes.filter(s => (s.daysRemaining ?? 0) <= 0);
    const stakedHex = active.reduce((sum, st) => sum + (st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8), 0);
    const tShares = active.reduce((sum, st) => sum + (st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12), 0);
    const rate = chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
    const dailyHex = active.reduce((sum, st) => sum + (st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12) * rate, 0);
    const yieldToDateHex = active.reduce((sum, st) => sum + stakeAccruedYieldHex(st), 0);
    const totalActiveHex = liquidHex + stakedHex + yieldToDateHex;

    return {
      chain,
      label,
      token,
      price,
      color,
      activeCount: active.length,
      maturedCount: matured.length,
      liquidHex,
      stakedHex,
      tShares,
      dailyHex,
      yieldToDateHex,
      totalActiveHex,
    };
  });

  // -- Filter stakes -----------------------------------------------------------

  const filteredStakes = stakes.filter(s => {
    if (stakeFilter === 'phex') return s.chain === 'pulsechain';
    if (stakeFilter === 'ehex') return s.chain === 'ethereum';
    if (stakeFilter === 'ending-soon') return (s.daysRemaining ?? 0) > 0 && (s.daysRemaining ?? 0) <= 90;
    if (stakeFilter === 'matured') return (s.daysRemaining ?? 0) <= 0;
    return true;
  });

  const filterCounts: Record<StakeFilter, number> = {
    all: stakes.length,
    phex: pHexStakes.length,
    ehex: eHexStakes.length,
    'ending-soon': stakes.filter(s => (s.daysRemaining ?? 0) > 0 && (s.daysRemaining ?? 0) <= 90).length,
    matured: stakes.filter(s => (s.daysRemaining ?? 0) <= 0).length,
  };

  // -- Filter pill labels ------------------------------------------------------

  const filterPills: { id: StakeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'phex', label: 'pHEX' },
    { id: 'ehex', label: 'eHEX' },
    { id: 'ending-soon', label: 'Ending Soon' },
    { id: 'matured', label: 'Matured' },
  ];

  // -- Progress bar color ------------------------------------------------------
  function progressColor(pct: number): string {
    if (pct > 50) return '#00FF9F';
    if (pct >= 25) return '#f97316';
    return '#ef4444';
  }

  // -- Days left badge class ---------------------------------------------------
  function daysClass(d: number): string {
    if (d <= 30) return 'days-left-expiring';
    if (d <= 180) return 'days-left-soon';
    return 'days-left-healthy';
  }

  function fmtDays(d: number): string {
    return d >= 365 ? `${(d / 365).toFixed(1)}y` : `${d.toLocaleString('en-US', { maximumFractionDigits: 0 })}d`;
  }

  // -- Empty state -------------------------------------------------------------
  if (stakes.length === 0) {
    return (
      <div className="stakes-empty">
        <div className="stakes-empty-icon">
          <Lock size={24} style={{ color: '#a78bfa' }} />
        </div>
        <div className="stakes-empty-copy">
          <div className="stakes-empty-title">No HEX Stakes Found</div>
          <div className="stakes-empty-text">
            Add a wallet with active HEX stakes on PulseChain or Ethereum to see your staking dashboard.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stakes-section">

      {/* -- 1. Hero: Daily HEX Yield --------------------------------------- */}
      <div className="stakes-hero-card">
        <div className="stakes-hero-main">
          <div className="stakes-hero-title-row">
            <div className="stakes-hero-icon">
            <Zap size={26} style={{ color: '#c4b5fd' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="stakes-hero-kicker">HEX staking yield</div>
            <h1 className="stakes-hero-title">HEX Staking</h1>
          </div>
          </div>
          <p className="stakes-hero-copy">
            Liquid exposure, active yield, and maturity estimates across PulseChain and Ethereum.
          </p>
          <div className="stakes-hero-yield">
            <span className="stakes-hero-yield-label">Daily HEX Yield</span>
            <strong className="tabular-nums">{fmtHex(dailyYieldHex)}</strong>
            <span>{fmtUsd(dailyYieldUsd)} estimated across all active stakes</span>
          </div>
        </div>

        <div className="stakes-hero-mini-stats">
          {[
            { label: 'Weekly', value: fmtHex(dailyYieldHex * 7), sub: fmtUsd(dailyYieldUsd * 7), tone: 'yield' },
            { label: 'Monthly', value: fmtHex(dailyYieldHex * 30), sub: fmtUsd(dailyYieldUsd * 30), tone: 'yield' },
            { label: 'Annual', value: fmtHex(dailyYieldHex * 365), sub: fmtUsd(dailyYieldUsd * 365), tone: 'yield' },
            { label: 'Maturity', value: `${fmtHex(totalMaturityHex)} HEX`, sub: `${fmtUsd(totalMaturityValueUsd)} projected`, tone: 'maturity' },
            { label: 'Total Yield', value: `+${fmtHex(Math.max(0, totalMaturityHex - totalHexStaked))}`, sub: totalHexStaked > 0 ? `${((totalMaturityHex / totalHexStaked - 1) * 100).toFixed(1)}% yield` : 'waiting for stakes', tone: 'maturity' },
          ].map(({ label, value, sub, tone }) => (
            <div key={label} className={`stakes-hero-mini-card ${tone}`}>
              <div className="stakes-hero-mini-label">{label}</div>
              <div className="stakes-hero-mini-value tabular-nums">
                {value}
              </div>
              <div className="stakes-hero-mini-sub">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="stakes-charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <StakingPie stakes={activeStakes.length > 0 ? activeStakes : stakes} hexUsdPrice={hexUsdPrice} />
        <StakingLadder stakes={activeStakes.length > 0 ? activeStakes : stakes} />
      </div>

      {/* -- 2. HEX Totals -------------------------------------------------- */}
      <div className="stakes-performance-grid">
        {chainPerformance.map(chain => (
          <div key={chain.chain} className="stakes-performance-card" style={{ ['--stake-chain-color' as string]: chain.color }}>
            <div className="stakes-performance-head">
              <div>
                <div className="stakes-performance-kicker">{chain.label} - {chain.token}</div>
                <div className="stakes-performance-title">{chain.activeCount} active stakes</div>
              </div>
              <div className="stakes-performance-tshares">
                <strong>{chain.tShares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</strong>
                <span>T-Shares</span>
              </div>
            </div>

            <div className="stakes-performance-main">
              {[
                { label: 'Liquid', hex: chain.liquidHex, tone: 'muted' },
                { label: 'Staked', hex: chain.stakedHex, tone: 'base' },
                { label: 'Active Yield', hex: chain.yieldToDateHex, tone: 'positive' },
                { label: 'Total', hex: chain.totalActiveHex, tone: 'strong' },
              ].map(item => (
                <div key={item.label} className={`stakes-balance-row ${item.tone}`}>
                  <span>{item.label}</span>
                  <strong>{fmtHexExact(item.hex)}</strong>
                  <small>{fmtUsdExact(item.hex * chain.price)}</small>
                </div>
              ))}
            </div>

            <div className="stakes-performance-footer">
              <span>Daily yield ~{fmtHex(chain.dailyHex)} {chain.token}/day</span>
              <span>{fmtUsd(chain.dailyHex * chain.price)} - {chain.maturedCount} inactive</span>
            </div>
          </div>
        ))}
      </div>

      <div className="stakes-totals-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* pHEX */}
        <div className="stakes-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chain-pulse)', boxShadow: '0 0 6px var(--chain-pulse)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.07em' }}>pHEX Staked</span>
          </div>
          <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 800, color: 'var(--chain-pulse)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtHex(totalPHex)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>
            {fmtUsd(totalPHex * phexUsdPrice)} - {activePHexStakes.length} active stake{activePHexStakes.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* eHEX */}
        <div className="stakes-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chain-eth)', boxShadow: '0 0 6px var(--chain-eth)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.07em' }}>eHEX Staked</span>
          </div>
          <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 800, color: 'var(--chain-eth)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtHex(totalEHex)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>
            {fmtUsd(totalEHex * ehexUsdPrice)} - {activeEHexStakes.length} active stake{activeEHexStakes.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* -- 3. Key Metrics ------------------------------------------------- */}
      {/* Row A: 3 compact stats */}
      <div className="stakes-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {/* HEX Staked */}
        <div className="stakes-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Layers size={14} style={{ color: 'var(--fg-subtle)' }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.07em' }}>HEX Staked</div>
          </div>
          <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', marginBottom: 4 }}>
            {fmtHex(totalHexStaked)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{activeStakes.length} active - {stakes.length - activeStakes.length} inactive</div>
        </div>

        {/* Current Value */}
        <div className="stakes-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Activity size={14} style={{ color: 'var(--fg-subtle)' }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Current Value</div>
          </div>
          <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', marginBottom: 4 }}>
            {fmtUsd(totalCurrentValueUsd)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>at current HEX price</div>
        </div>

        {/* Active T-Shares */}
        <div className="stakes-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Filter size={14} style={{ color: 'var(--fg-subtle)' }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.07em' }}>T-Shares</div>
          </div>
          <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', marginBottom: 4 }}>
            {totalTShares.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>across all chains</div>
        </div>
      </div>

      {/* -- 5. Individual Stakes Table ------------------------------------- */}
      <div className="stakes-table-card">

        {/* Table header + filter pills */}
        <div className="stakes-table-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="stakes-table-title">HEX Stakes</span>
              <span className="stakes-table-count">
                {filteredStakes.length} shown
              </span>
            </div>
          </div>

          {/* Filter pills */}
          <div className="stakes-filter-tabs">
            {filterPills.map(({ id, label }) => (
              <button
                key={id}
                className={`stake-filter-pill${stakeFilter === id ? ' active' : ''}`}
                onClick={() => setStakeFilter(id)}
              >
                {label}
                {filterCounts[id] > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>
                    {filterCounts[id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table body */}
        {filteredStakes.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 14 }}>
            <Lock size={28} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
            No stakes match this filter
          </div>
        ) : (
          <div className="stakes-table-wrapper">
            <table className="stakes-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Stake ID</th>
                  <th>Chain</th>
                  <th className="col-hide-mobile">Wallet</th>
                  <th>Staked</th>
                  <th className="col-hide-mobile">T-Shares</th>
                  <th className="col-hide-mobile">Progress</th>
                  <th>Days Left</th>
                  <th className="col-hide-mobile">Total Yield</th>
                  <th>Current Value</th>
                  <th className="col-hide-mobile">Value at Maturity</th>
                </tr>
              </thead>
              <tbody>
                {filteredStakes.map(stake => {
                  const stakedHex  = stake.stakedHex ?? Number(stake.stakedHearts ?? 0n) / 1e8;
                  const hexPrice   = stake.chain === 'pulsechain' ? phexUsdPrice : ehexUsdPrice;
                  // Always derive from tShares at the chain-specific rate so stale cached fields
                  // (stakeHexYield / interestHearts / estimatedValueUsd / totalValueUsd)
                  // never show wrong numbers - even before the next wallet sync.
                  const tShares       = stake.tShares ?? Number(stake.stakeShares ?? 0n) / 1e12;
                  const daysLeft      = stake.daysRemaining ?? 0;
                  const daysStakedSoFar = Math.max(0, (stake.stakedDays ?? 0) - daysLeft);
                  const yieldRate     = stake.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
                  const accruedHex    = tShares * daysStakedSoFar * yieldRate;
                  const yieldHex      = tShares * (stake.stakedDays ?? 0) * yieldRate;   // full yield at maturity
                  const currentValueUsd  = (stakedHex + accruedHex) * hexPrice;    // principal + accrued
                  const maturityHex      = stakedHex + yieldHex;
                  const maturityValueUsd = maturityHex * hexPrice;
                  const chainLabel = stake.chain === 'pulsechain' ? 'PulseChain' : 'Ethereum';
                  const tokenLabel = stake.chain === 'pulsechain' ? 'pHEX' : 'eHEX';
                  const dailyYield = tShares * yieldRate;
                  const principalValueUsd = stakedHex * hexPrice;
                  const activeYieldUsd = accruedHex * hexPrice;
                  const stakeLength = stake.stakedDays ?? 0;
                  const lockedDay = stake.lockedDay ?? 0;
                  const endDay = lockedDay + stakeLength;
                  const detailStats = [
                    { label: 'Principal', val: `${fmtHexExact(stakedHex)} ${tokenLabel}`, sub: fmtUsdExact(principalValueUsd) },
                    { label: 'Active Yield', val: `+${fmtHexExact(accruedHex)} ${tokenLabel}`, sub: fmtUsdExact(activeYieldUsd), color: 'var(--positive)' },
                    { label: 'Daily Yield', val: `+${fmtHexExact(dailyYield)} ${tokenLabel}`, sub: `${yieldRate.toFixed(2)} HEX/T-Share/day`, color: 'var(--positive)' },
                    { label: 'Current Value', val: fmtUsdExact(currentValueUsd), sub: `${fmtHexExact(stakedHex + accruedHex)} ${tokenLabel}` },
                    { label: 'Maturity', val: fmtUsdExact(maturityValueUsd), sub: `${fmtHexExact(maturityHex)} ${tokenLabel}`, color: 'var(--positive)' },
                    { label: 'T-Shares', val: tShares.toLocaleString('en-US', { maximumFractionDigits: 6 }), sub: 'Stake weight' },
                    {
                      label: 'Timeline',
                      val: `${fmtDays(daysLeft)} left`,
                      sub: `Day ${lockedDay.toLocaleString()} -> ${endDay.toLocaleString()}`,
                      color: daysLeft <= 30 && daysLeft > 0 ? '#ef4444' : daysLeft <= 180 ? '#f97316' : undefined,
                    },
                    { label: 'Progress', val: `${stake.progress}%`, sub: `${daysStakedSoFar.toLocaleString()} / ${stakeLength.toLocaleString()} days` },
                  ];
                  const walletLabel = stake.walletLabel
                    ?? (stake.walletAddress ? (walletLabels[stake.walletAddress] ?? shortenAddr(stake.walletAddress)) : '-');
                  const isExpanded = expandedStakeIds.has(stake.id);

                  return (
                    <React.Fragment key={stake.id}>
                    <tr
                      className={`stake-summary-row${isExpanded ? ' is-expanded' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleStakeDetails(stake.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleStakeDetails(stake.id);
                        }
                      }}
                    >
                      <td style={{ color: 'var(--fg)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                        <span className={`stake-expand-caret${isExpanded ? ' is-open' : ''}`} aria-hidden="true">›</span>
                        #{stake.stakeId}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: stake.chain === 'pulsechain' ? 'rgba(247,57,255,0.10)' : 'rgba(138,164,240,0.10)',
                          color: stake.chain === 'pulsechain' ? 'var(--chain-pulse)' : 'var(--chain-eth)',
                          border: `1px solid ${stake.chain === 'pulsechain' ? 'rgba(247,57,255,0.20)' : 'rgba(138,164,240,0.20)'}`,
                        }}>
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: stake.chain === 'pulsechain' ? 'var(--chain-pulse)' : 'var(--chain-eth)',
                            flexShrink: 0,
                          }} />
                          {tokenLabel}
                        </span>
                      </td>
                      <td className="col-hide-mobile" style={{ fontSize: 12, color: 'var(--fg-subtle)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {walletLabel}
                      </td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                        {fmtHex(stakedHex)}
                      </td>
                      <td className="col-hide-mobile" style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
                        {tShares.toFixed(2)}
                      </td>
                      <td className="col-hide-mobile" style={{ minWidth: 80 }}>
                        <div className="stake-progress-bar">
                          <div
                            className="stake-progress-fill"
                            style={{ width: `${stake.progress}%`, background: progressColor(stake.progress) }}
                          />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 3, textAlign: 'right' }}>
                          {stake.progress}%
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span className={`days-left-pill ${daysClass(daysLeft)}`} style={{ fontSize: 12, padding: '4px 10px' }}>
                            {fmtDays(daysLeft)}
                          </span>
                          {daysLeft <= 30 && daysLeft > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.05em' }}>Expiring!</span>
                          )}
                          {daysLeft > 30 && daysLeft <= 180 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '.05em' }}>Soon</span>
                          )}
                        </div>
                      </td>
                      <td className="col-hide-mobile" style={{ textAlign: 'right', color: 'var(--positive)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                        +{fmtHex(yieldHex)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--fg)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtUsd(currentValueUsd)}
                      </td>
                      <td className="col-hide-mobile" style={{ textAlign: 'right', color: 'var(--positive)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        {fmtHex(maturityHex)} HEX
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="stake-detail-row">
                        <td colSpan={10}>
                          <div className="stake-detail-panel">
                            <div className="stake-detail-context">
                              <span>Stake #{stake.stakeId} on <strong>{chainLabel}</strong></span>
                              <span>Wallet <strong>{walletLabel}</strong></span>
                              <span>{stakeLength.toLocaleString()} days locked</span>
                            </div>
                            <div className="stake-detail-grid">
                              {detailStats.map(({ label, val, sub, color }) => (
                                <div key={label} className="stake-detail-stat">
                                  <div className="stake-detail-label">{label}</div>
                                  <div className="stake-detail-value" style={{ color: color ?? 'var(--fg)' }}>{val}</div>
                                  <div className="stake-detail-sub">{sub}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Total ({filteredStakes.length})
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtHex(filteredStakes.reduce((s, st) => s + (st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8), 0))}
                  </td>
                  <td className="col-hide-mobile" />
                  <td className="col-hide-mobile" />
                  <td />
                  <td className="col-hide-mobile" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--positive)', fontFamily: "'JetBrains Mono', monospace" }}>
                    +{fmtHex(filteredStakes.reduce((s, st) => {
                      const t = st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12;
                      const r = st.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
                      return s + t * (st.stakedDays ?? 0) * r;
                    }, 0))}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtUsd(filteredStakes.reduce((s, st) => {
                      const principal = st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8;
                      const t = st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12;
                      const r = st.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
                      const accrued = t * Math.max(0, (st.stakedDays ?? 0) - (st.daysRemaining ?? 0)) * r;
                      const hp = st.chain === 'pulsechain' ? phexUsdPrice : ehexUsdPrice;
                      return s + (principal + accrued) * hp;
                    }, 0))}
                  </td>
                  <td className="col-hide-mobile" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--positive)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtHex(filteredStakes.reduce((s, st) => s + stakeMaturityHex(st), 0))} HEX
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
