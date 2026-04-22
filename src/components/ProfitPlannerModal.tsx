import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, TrendingUp, Lightbulb, AlertTriangle, ChevronDown, ChevronUp, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { Asset } from '../types';

// --- Types --------------------------------------------------------------------
type Mode = 'profit' | 'portfolio';
type Horizon = '1m' | '3m' | '6m' | '1y';
type Preset = 'conservative' | 'balanced' | 'aggressive' | 'moon';

export interface ProfitPlannerModalProps {
  open: boolean;
  onClose: () => void;
  assets: Asset[];
  totalValue: number;
}

// --- Helpers -----------------------------------------------------------------
function fmtD(n: number): string {
  if (!isFinite(n)) return '$0';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ALLOC_COLORS = ['#00FF9F', '#627EEA', '#f97316', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899'];

// Weight applied to top-coin concentration in the diversification score formula:
// score = 100 - (topCoinPct * CONCENTRATION_WEIGHT). Higher weight = harsher penalty.
const CONCENTRATION_WEIGHT = 70;

const PRESET_GROWTH: Record<Preset, number> = {
  conservative: 20,
  balanced: 50,
  aggressive: 150,
  moon: 500,
};

const PRESET_LABELS: Record<Preset, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
  moon: '🌕 Moon',
};

const HORIZON_LABELS: Record<Horizon, string> = {
  '1m': '1 Month',
  '3m': '3 Months',
  '6m': '6 Months',
  '1y': '1 Year',
};

const GUIDE_QUESTIONS = [
  {
    key: 'risk',
    question: 'What is your risk tolerance?',
    options: ['Low', 'Medium', 'High'],
  },
  {
    key: 'horizon',
    question: "What's your exit time horizon?",
    options: ['1 Month', '3 Months', '6 Months', '1 Year'],
  },
  {
    key: 'protect',
    question: 'Which coins do you want to protect / never sell?',
    type: 'checkbox' as const,
  },
  {
    key: 'keepStaking',
    question: 'Do you want to keep your HEX/staking positions?',
    options: ['Yes', 'No'],
  },
  {
    key: 'profitDest',
    question: 'What will you do with profits?',
    options: ['Take to Stablecoins', 'Reinvest in BTC/ETH', 'Withdraw to Bank', 'Other'],
  },
] as const;

// --- Component ----------------------------------------------------------------
export function ProfitPlannerModal({ open, onClose, assets, totalValue }: ProfitPlannerModalProps) {
  const [mode, setMode] = useState<Mode>('profit');
  const [targetInput, setTargetInput] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('3m');
  const [preset, setPreset] = useState<Preset | null>(null);
  const [growthMap, setGrowthMap] = useState<Record<string, number>>({});
  const [guideStep, setGuideStep] = useState(0);
  const [guideAnswers, setGuideAnswers] = useState<Record<string, string | string[]>>({});
  const [guideOpen, setGuideOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const topCoins = useMemo(() => {
    return [...assets]
      .filter(a => a.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [assets]);

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    const growth = PRESET_GROWTH[p];
    const map: Record<string, number> = {};
    topCoins.forEach(c => { map[c.symbol] = growth; });
    setGrowthMap(map);
  }, [topCoins]);

  const calc = useMemo(() => {
    const target = parseFloat(targetInput) || 0;

    const coinCalcs = topCoins.map(coin => {
      const growth = (growthMap[coin.symbol] ?? 0) / 100;
      const projectedValue = coin.value * (1 + growth);
      const profitFromCoin = projectedValue - coin.value;
      return { ...coin, growth, projectedValue, profitFromCoin };
    });

    const currentTotal = topCoins.reduce((s, c) => s + c.value, 0);
    const projectedTotal = coinCalcs.reduce((s, c) => s + c.projectedValue, 0);

    const targetPortfolio = mode === 'profit' ? totalValue + target : target;
    const targetProfit = targetPortfolio - totalValue;
    const targetMet = projectedTotal >= targetPortfolio;

    const gainers = coinCalcs.filter(c => c.profitFromCoin > 0);
    const totalGains = gainers.reduce((s, c) => s + c.profitFromCoin, 0);
    const profitNeeded = Math.max(0, targetProfit);

    const sellMap: Record<string, number> = {};
    if (totalGains > 0 && profitNeeded > 0) {
      gainers.forEach(c => {
        const share = c.profitFromCoin / totalGains;
        sellMap[c.symbol] = Math.min(share * profitNeeded, c.profitFromCoin);
      });
    }

    const topPct = totalValue > 0 ? (topCoins[0]?.value ?? 0) / totalValue : 0;
    const diversificationScore = Math.max(0, Math.round(100 - topPct * CONCENTRATION_WEIGHT));

    const concentrationWarning =
      topPct > 0.5
        ? `${topCoins[0]?.symbol} makes up ${(topPct * 100).toFixed(0)}% of your portfolio - high concentration risk`
        : null;

    return {
      coinCalcs,
      currentTotal,
      projectedTotal,
      totalProjectedProfit: projectedTotal - currentTotal,
      targetPortfolio,
      targetProfit,
      targetMet,
      sellMap,
      diversificationScore,
      concentrationWarning,
      profitNeeded,
    };
  }, [topCoins, growthMap, targetInput, mode, totalValue]);

  // -- Guide helpers ----------------------------------------------------------
  const isGuideComplete = guideStep >= GUIDE_QUESTIONS.length;

  const handleGuideOption = (key: string, value: string) => {
    setGuideAnswers(prev => ({ ...prev, [key]: value }));
    if (guideStep < GUIDE_QUESTIONS.length - 1) setGuideStep(s => s + 1);
    else setGuideStep(GUIDE_QUESTIONS.length); // done
  };

  const handleCheckboxToggle = (key: string, value: string) => {
    setGuideAnswers(prev => {
      const current = (prev[key] as string[] | undefined) ?? [];
      return {
        ...prev,
        [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value],
      };
    });
  };

  const buildExitPlan = () => {
    const risk = guideAnswers['risk'] as string | undefined;
    const h = guideAnswers['horizon'] as string | undefined;
    const protected_ = (guideAnswers['protect'] as string[] | undefined) ?? [];
    const keepStaking = guideAnswers['keepStaking'] as string | undefined;
    const dest = guideAnswers['profitDest'] as string | undefined;

    const riskRec =
      risk === 'Low' ? 'Prioritize capital preservation - sell only profits, hold principal'
      : risk === 'High' ? 'High risk tolerance - you can ride larger swings without selling'
      : 'Balanced approach - trim winners, hold core positions';

    const sellable = topCoins.filter(c => !protected_.includes(c.symbol)).map(c => c.symbol);

    const timeAdvice =
      h === '1 Month' ? 'Short runway - focus on your highest-gain positions first'
      : h === '1 Year' ? 'Long runway - dollar-cost-out over multiple market cycles'
      : 'Medium runway - consider staged exits at preset price targets';

    const profitsAdvice =
      dest === 'Take to Stablecoins' ? 'Move proceeds to on-chain stablecoins to lock in gains'
      : dest === 'Reinvest in BTC/ETH' ? 'Rotate into blue-chip crypto to reduce chain concentration'
      : dest === 'Withdraw to Bank' ? 'Ensure you account for taxable events before withdrawal'
      : 'Define a clear plan for profit redeployment before executing';

    return { risk, riskRec, protected_, sellable, h, timeAdvice, dest, profitsAdvice, keepStaking };
  };

  const divScoreColor =
    calc.diversificationScore >= 70 ? 'var(--accent)'
    : calc.diversificationScore >= 40 ? '#f59e0b'
    : '#f43f5e';

  if (!open) return null;

  return (
    <>
      {/* Injected slider styles */}
      <style>{`
        .profit-planner-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          background: transparent;
          cursor: pointer;
        }
        .profit-planner-slider::-webkit-slider-runnable-track {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
        .profit-planner-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 2px solid #0A0A0A;
          box-shadow: 0 0 8px rgba(0,255,159,0.35);
          margin-top: -7px;
        }
        .profit-planner-slider::-moz-range-track {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
        .profit-planner-slider::-moz-range-thumb {
          width: 18px; height: 18px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 2px solid #0A0A0A;
          box-shadow: 0 0 8px rgba(0,255,159,0.35);
        }
        @media (max-width: 639px) {
          .pp-coin-row { flex-direction: column !important; align-items: flex-start !important; }
          .pp-coin-row .pp-slider-col { width: 100% !important; }
          .pp-chart-wrap { overflow-x: auto; }
        }
        @media (max-width: 639px) {
          .pp-modal-inner {
            border-radius: 20px 20px 0 0 !important;
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            max-width: 100% !important;
            max-height: 92vh !important;
          }
        }
      `}</style>

      {/* Overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 250,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Panel */}
        <div
          className="pp-modal-inner"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-border)',
            borderRadius: 20,
            width: '100%', maxWidth: 780,
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 0 80px rgba(0,255,159,0.06)',
          }}
        >
          {/* -- Header -- */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--accent-border)',
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg-surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, var(--accent-dim) 0%, rgba(99,70,255,0.10) 100%)',
                border: '1.5px solid var(--accent-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TrendingUp size={18} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Profit Planner</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Model your exit strategy</div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--fg-muted)',
              }}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* -- Mode Tabs + Input Row -- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
                {([['profit', 'Target Profit'], ['portfolio', 'Target Portfolio Value']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', border: 'none', transition: 'all .15s',
                      background: mode === m ? 'var(--accent)' : 'transparent',
                      color: mode === m ? '#000' : 'var(--fg-muted)',
                    }}
                  >{label}</button>
                ))}
              </div>

              {/* Input + Horizon */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 180px' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)', fontSize: 14, fontWeight: 700 }}>$</span>
                  <input
                    type="number"
                    min="0"
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    placeholder={mode === 'profit' ? 'e.g. 50000' : 'e.g. 200000'}
                    style={{
                      width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 10, color: 'var(--fg)', fontSize: 14, padding: '10px 14px 10px 28px',
                      outline: 'none', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(['1m', '3m', '6m', '1y'] as Horizon[]).map(h => (
                    <button key={h} onClick={() => setHorizon(h)}
                      style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', border: '1px solid',
                        borderColor: horizon === h ? 'var(--accent)' : 'var(--border)',
                        background: horizon === h ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        color: horizon === h ? 'var(--accent)' : 'var(--fg-muted)',
                        transition: 'all .15s',
                      }}
                    >{HORIZON_LABELS[h]}</button>
                  ))}
                </div>
              </div>

              {/* Preset strip */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['conservative', 'balanced', 'aggressive', 'moon'] as Preset[]).map(p => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', border: '1px solid',
                      borderColor: preset === p ? 'var(--accent)' : 'var(--border)',
                      background: preset === p ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      color: preset === p ? 'var(--accent)' : 'var(--fg-muted)',
                      transition: 'all .15s',
                    }}
                  >{PRESET_LABELS[p]}</button>
                ))}
              </div>
            </div>

            {/* -- Coin Rows -- */}
            {topCoins.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.8px' }}>
                  Top Holdings - Expected Growth
                </div>
                {calc.coinCalcs.map(coin => {
                  const pct = totalValue > 0 ? (coin.value / totalValue) * 100 : 0;
                  const growthPct = growthMap[coin.symbol] ?? 0;
                  const sellAmt = calc.sellMap[coin.symbol] ?? 0;
                  return (
                    <div
                      key={coin.id}
                      className="pp-coin-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'var(--bg-elevated)', borderRadius: 12, padding: '12px 14px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {/* Logo + Info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 130 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--bg-inset)', border: '1.5px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', fontSize: 13, fontWeight: 800, color: 'var(--fg-muted)',
                          position: 'relative',
                        }}>
                          <span style={{ position: 'absolute' }}>{coin.symbol[0]}</span>
                          {coin.logoUrl && (
                            <img
                              src={coin.logoUrl} alt={coin.symbol}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', position: 'relative' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{coin.symbol}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                            {fmtD(coin.value)} · {pct.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* Slider col */}
                      <div className="pp-slider-col" style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input
                            type="range"
                            className="profit-planner-slider"
                            min={0} max={500} step={5}
                            value={growthPct}
                            onChange={e => {
                              setPreset(null);
                              setGrowthMap(prev => ({ ...prev, [coin.symbol]: Number(e.target.value) }));
                            }}
                          />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 48, textAlign: 'right', fontFamily: 'var(--font-shell-display)' }}>
                            +{growthPct}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg-subtle)', flexWrap: 'wrap' }}>
                          <span>{'-> '}<span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-shell-display)' }}>{fmtD(coin.projectedValue)}</span></span>
                          {sellAmt > 0 && (
                            <span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--font-shell-display)' }}>
                              sell {fmtD(sellAmt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-muted)', fontSize: 13 }}>
                Add a wallet and refresh to load your holdings.
              </div>
            )}

            {/* -- Results Panel -- */}
            {topCoins.length > 0 && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 14, padding: '16px',
                border: '1px solid var(--border)',
              }}>
                {/* Summary bar */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Current</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)' }}>{fmtD(calc.currentTotal)}</div>
                  </div>
                  <div style={{ color: 'var(--fg-subtle)', fontSize: 18 }}>{'->'}</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Projected</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-shell-display)' }}>{fmtD(calc.projectedTotal)}</div>
                  </div>
                  {calc.targetPortfolio > 0 && (
                    <>
                      <div style={{ color: 'var(--fg-subtle)', fontSize: 18 }}>{'->'}</div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Target</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)' }}>{fmtD(calc.targetPortfolio)}</div>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        {calc.targetMet ? (
                          <span style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--accent)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                            ✓ Met
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                            ✗ Short by {fmtD(calc.targetPortfolio - calc.projectedTotal)}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Bar chart */}
                <div className="pp-chart-wrap" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height={180} minWidth={0} minHeight={1}>
                    <BarChart
                      data={calc.coinCalcs.map(c => ({
                        name: c.symbol.slice(0, 8),
                        Current: parseFloat(c.value.toFixed(2)),
                        Projected: parseFloat(c.projectedValue.toFixed(2)),
                      }))}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fill: 'var(--fg-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <RechartsTooltip
                        contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                        formatter={(value: number) => fmtD(value)}
                      />
                      <Bar dataKey="Current" radius={[4, 4, 0, 0]}>
                        {calc.coinCalcs.map((_, i) => <Cell key={i} fill="#627EEA" />)}
                      </Bar>
                      <Bar dataKey="Projected" radius={[4, 4, 0, 0]}>
                        {calc.coinCalcs.map((_, i) => <Cell key={i} fill="var(--accent)" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Allocation bar */}
                {calc.currentTotal > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Allocation</div>
                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 10 }}>
                      {calc.coinCalcs.map((c, i) => {
                        const w = (c.value / calc.currentTotal) * 100;
                        return <div key={c.id} style={{ width: `${w}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} title={`${c.symbol}: ${w.toFixed(1)}%`} />;
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                      {calc.coinCalcs.map((c, i) => {
                        const w = (c.value / calc.currentTotal) * 100;
                        return (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                            <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{c.symbol} {w.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* -- Smart Tips -- */}
            {topCoins.length > 0 && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 14, padding: '16px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Lightbulb size={15} color="#f59e0b" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Smart Tips</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                  {/* Sell recommendation */}
                  {calc.profitNeeded > 0 && Object.keys(calc.sellMap).length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Sell recommendation:</span>{' '}
                      To reach your target, sell:{' '}
                      {Object.entries(calc.sellMap)
                        .filter(([, v]) => (v as number) > 0)
                        .map(([sym, val]) => `${sym}: ${fmtD(val as number)}`)
                        .join(', ')}
                    </div>
                  )}

                  {/* Concentration warning */}
                  {calc.concentrationWarning && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                      borderRadius: 8, padding: '8px 10px',
                    }}>
                      <AlertTriangle size={13} color="#f59e0b" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#f59e0b', lineHeight: 1.5 }}>⚠ {calc.concentrationWarning}</span>
                    </div>
                  )}

                  {/* Diversification score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Diversification Score:</span>
                    <span style={{
                      fontSize: 12, fontWeight: 800, color: divScoreColor,
                      background: `${divScoreColor}18`, border: `1px solid ${divScoreColor}40`,
                      borderRadius: 6, padding: '2px 8px', fontFamily: 'var(--font-shell-display)',
                    }}>
                      {calc.diversificationScore}/100
                    </span>
                  </div>

                  {/* Target status */}
                  {calc.targetPortfolio > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                      {calc.targetMet ? (
                        <span style={{ color: 'var(--accent)' }}>✓ Your projected growth covers the target profit</span>
                      ) : (
                        <span style={{ color: '#f43f5e' }}>
                          ✗ You're {fmtD(calc.targetPortfolio - calc.projectedTotal)} short - consider higher growth estimates or a lower target
                        </span>
                      )}
                    </div>
                  )}

                  {/* HEX staking note */}
                  {topCoins.some(c => c.symbol === 'HEX' || c.symbol === 'pHEX' || c.symbol === 'eHEX') && (
                    <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                      💡 HEX/pHEX staking positions are included in current value but typically locked - factor that into sell estimates.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* -- Exit Strategy Guide -- */}
            <div style={{ borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <button
                onClick={() => setGuideOpen(p => !p)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', background: 'var(--bg-elevated)', border: 'none',
                  cursor: 'pointer', color: 'var(--fg)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>🧭 Exit Strategy Guide</span>
                {guideOpen ? <ChevronUp size={16} color="var(--fg-muted)" /> : <ChevronDown size={16} color="var(--fg-muted)" />}
              </button>

              {guideOpen && (
                <div style={{ padding: '16px', background: 'var(--bg-surface)' }}>
                  {!isGuideComplete ? (
                    <>
                      {/* Step indicator */}
                      <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 12 }}>
                        Step {guideStep + 1} of {GUIDE_QUESTIONS.length}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginBottom: 12 }}>
                        {GUIDE_QUESTIONS[guideStep].question}
                      </div>

                      {/* Checkbox variant */}
                      {('type' in GUIDE_QUESTIONS[guideStep] && GUIDE_QUESTIONS[guideStep].type === 'checkbox') ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {topCoins.map(coin => {
                            const selected = ((guideAnswers['protect'] as string[] | undefined) ?? []).includes(coin.symbol);
                            return (
                              <label key={coin.symbol} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => handleCheckboxToggle('protect', coin.symbol)}
                                  style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                                />
                                <span style={{ fontSize: 13, color: 'var(--fg)' }}>{coin.symbol}</span>
                                <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{fmtD(coin.value)}</span>
                              </label>
                            );
                          })}
                          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                            {guideStep > 0 && (
                              <button
                                onClick={() => setGuideStep(s => s - 1)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                              >
                                <ChevronLeft size={13} /> Back
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (guideStep < GUIDE_QUESTIONS.length - 1) setGuideStep(s => s + 1);
                                else setGuideStep(GUIDE_QUESTIONS.length);
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Next <ChevronRight size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Button options */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {('options' in GUIDE_QUESTIONS[guideStep] ? GUIDE_QUESTIONS[guideStep].options : undefined)?.map(opt => (
                              <button
                                key={opt}
                                onClick={() => handleGuideOption(GUIDE_QUESTIONS[guideStep].key, opt)}
                                style={{
                                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', border: '1px solid',
                                  borderColor: guideAnswers[GUIDE_QUESTIONS[guideStep].key] === opt ? 'var(--accent)' : 'var(--border)',
                                  background: guideAnswers[GUIDE_QUESTIONS[guideStep].key] === opt ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                                  color: guideAnswers[GUIDE_QUESTIONS[guideStep].key] === opt ? 'var(--accent)' : 'var(--fg-muted)',
                                  transition: 'all .15s',
                                }}
                              >{opt}</button>
                            ))}
                          </div>
                          {guideStep > 0 && (
                            <button
                              onClick={() => setGuideStep(s => s - 1)}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: 'fit-content', marginTop: 4 }}
                            >
                              <ChevronLeft size={13} /> Back
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Exit Plan output */
                    (() => {
                      const plan = buildExitPlan();
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>📋 Your Exit Plan</div>
                          <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7 }}>
                            Based on your answers:
                          </div>
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <li style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                              <span style={{ color: 'var(--accent)' }}>•</span>
                              <span><strong style={{ color: 'var(--fg)' }}>Risk:</strong> {plan.risk} {'->'} {plan.riskRec}</span>
                            </li>
                            {plan.protected_.length > 0 && (
                              <li style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                                <span style={{ color: 'var(--accent)' }}>•</span>
                                <span><strong style={{ color: 'var(--fg)' }}>Protected coins:</strong> {plan.protected_.join(', ')}</span>
                              </li>
                            )}
                            {plan.sellable.length > 0 && (
                              <li style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                                <span style={{ color: 'var(--accent)' }}>•</span>
                                <span><strong style={{ color: 'var(--fg)' }}>Sell from:</strong> {plan.sellable.join(', ')}</span>
                              </li>
                            )}
                            <li style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                              <span style={{ color: 'var(--accent)' }}>•</span>
                              <span><strong style={{ color: 'var(--fg)' }}>Target exit in</strong> {plan.h} {'->'} {plan.timeAdvice}</span>
                            </li>
                            <li style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                              <span style={{ color: 'var(--accent)' }}>•</span>
                              <span><strong style={{ color: 'var(--fg)' }}>Profits destination:</strong> {plan.profitsAdvice}</span>
                            </li>
                            {plan.keepStaking === 'Yes' && (
                              <li style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8 }}>
                                <span style={{ color: 'var(--accent)' }}>•</span>
                                <span>HEX staking positions will be kept intact.</span>
                              </li>
                            )}
                          </ul>
                          <button
                            onClick={() => { setGuideStep(0); setGuideAnswers({}); }}
                            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-muted)', width: 'fit-content', marginTop: 4 }}
                          >
                            ↺ Restart Guide
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

