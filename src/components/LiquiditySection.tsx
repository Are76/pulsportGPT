import React, { useEffect, useRef } from 'react';
import {
  Droplets,
  RefreshCcw,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Zap,
  TrendingUp,
  Award,
  Wallet,
} from 'lucide-react';
import { useLiquidityPositions } from '../hooks/useLiquidityPositions';
import { LiquidityPositionCard } from './LiquidityPositionCard';
import { fmtUsd, fmtTok } from '../lib/utils';
import type { LpPositionEnriched } from '../types';

// --- Skeleton row -------------------------------------------------------------
function SkeletonRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 12,
      background: 'var(--bg-inset)',
      border: '1px solid var(--border-inset)',
    }}>
      <div style={{ display: 'flex', width: 38, flexShrink: 0 }}>
        <div className="skeleton" style={{ width: 26, height: 26, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 26, height: 26, borderRadius: '50%', marginLeft: -10 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="skeleton" style={{ height: 13, width: 100, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 11, width: 160, borderRadius: 5 }} />
      </div>
      <div className="skeleton" style={{ width: 56, height: 28, borderRadius: 6 }} />
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="skeleton" style={{ height: 14, width: 64, borderRadius: 5 }} />
        <div className="skeleton" style={{ height: 10, width: 40, borderRadius: 4, marginTop: 4 }} />
      </div>
      <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--border-inset)' }} />
    </div>
  );
}

// --- Skeleton full card -------------------------------------------------------
function SkeletonCard() {
  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(247,57,255,0.04) 0%, var(--bg-inset) 100%)',
      border: '1px solid rgba(247,57,255,0.10)',
      borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'flex' }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', marginLeft: -15 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton" style={{ height: 17, width: 120, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 22, width: 100, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 11, width: 60, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border-inset)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[0, 1].map(i => (
          <div key={i} style={{
            background: 'var(--bg-inset)', border: '1px solid var(--border-inset)',
            borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
              <div className="skeleton" style={{ height: 13, width: 50, borderRadius: 4 }} />
            </div>
            <div className="skeleton" style={{ height: 3, borderRadius: 2 }} />
            <div className="skeleton" style={{ height: 14, width: 80, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 48, borderRadius: 10 }} />
    </div>
  );
}

// --- INC Token Logo -----------------------------------------------------------
function IncLogo({ size = 28 }: { size?: number }) {
  const [err, setErr] = React.useState(false);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      overflow: 'hidden', flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(247,57,255,0.2) 0%, rgba(99,70,255,0.2) 100%)',
      border: '1.5px solid rgba(247,57,255,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 800, color: 'var(--chain-pulse)',
    }}>
      {!err ? (
        <img
          src="https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png"
          alt="INC"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          onError={() => setErr(true)}
        />
      ) : 'I'}
    </div>
  );
}

// --- Farming Rewards Banner ---------------------------------------------------
interface FarmingRewardsBannerProps {
  stakedPositions: LpPositionEnriched[];
  incPrice: number;
}

function FarmingRewardsBanner({ stakedPositions, incPrice }: FarmingRewardsBannerProps) {
  if (stakedPositions.length === 0) return null;

  const totalPendingUsd = stakedPositions.reduce((s, p) => s + (p.pendingIncUsd ?? 0), 0);
  const totalLpUsd      = stakedPositions.reduce((s, p) => s + p.totalUsd, 0);
  const totalPendingInc = incPrice > 0 ? totalPendingUsd / incPrice : 0;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(247,57,255,0.08) 0%, rgba(99,70,255,0.06) 50%, rgba(247,57,255,0.04) 100%)',
      border: '1px solid rgba(247,57,255,0.20)',
      borderRadius: 16, padding: '18px 22px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top accent */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(247,57,255,0.5), transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        {/* Left: header + summary */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(247,57,255,0.15)', border: '1px solid rgba(247,57,255,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={16} style={{ color: 'var(--chain-pulse)' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
                INC Farming Rewards
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>
                {stakedPositions.length} active pool{stakedPositions.length > 1 ? 's' : ''} · PulseX MasterChef
              </div>
            </div>
          </div>

          {/* Stat grid */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                Staked LP Value
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.04em' }}>
                {fmtUsd(totalLpUsd)}
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                Pending INC
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--chain-pulse)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.04em' }}>
                  {fmtTok(totalPendingInc)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-shell-display)' }}>
                  INC
                </div>
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                Reward Value
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--positive)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.04em' }}>
                {fmtUsd(totalPendingUsd)}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Claim button + INC logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: -4 }}>
            {stakedPositions.slice(0, 3).map((_, i) => (
              <div key={i} style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(247,57,255,0.12)', border: '2px solid rgba(0,0,0,0.4)',
                marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IncLogo size={28} />
              </div>
            ))}
          </div>
          <a
            href="https://pulsex.com/#/farm"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 10,
              background: 'rgba(247,57,255,0.12)', border: '1px solid rgba(247,57,255,0.28)',
              color: 'var(--chain-pulse)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.22)')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.12)')}
          >
            <Award size={12} /> Claim on PulseX <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Per-pool breakdown */}
      <div style={{
        marginTop: 16, paddingTop: 14,
        borderTop: '1px solid rgba(247,57,255,0.12)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>
          Active Pools
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stakedPositions.map(pos => {
            const pendingInc = incPrice > 0 ? (pos.pendingIncUsd ?? 0) / incPrice : 0;
            return (
              <div key={pos.pairAddress} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 10,
                background: 'var(--bg-inset)', border: '1px solid rgba(247,57,255,0.08)',
                flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Pool ID badge */}
                  {pos.poolId !== undefined && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)',
                      background: 'var(--bg-inset)', padding: '2px 7px', borderRadius: 100,
                      fontFamily: 'var(--font-shell-display)',
                    }}>
                      Pool #{pos.poolId}
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                    {pos.pairName}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Staked LP</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)' }}>
                      {fmtUsd(pos.totalUsd)}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Pending INC</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--chain-pulse)', fontFamily: 'var(--font-shell-display)' }}>
                      {fmtTok(pendingInc)} INC
                    </div>
                  </div>
                  <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Value</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--positive)', fontFamily: 'var(--font-shell-display)' }}>
                      {fmtUsd(pos.pendingIncUsd ?? 0)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- LP Summary Stats ---------------------------------------------------------
function LpSummaryStats({ positions }: { positions: LpPositionEnriched[] }) {
  if (positions.length === 0) return null;

  const totalUsd      = positions.reduce((s, p) => s + p.totalUsd, 0);
  const totalFees24h  = positions.reduce((s, p) => s + (p.fees24hUsd ?? 0), 0);
  const avgOwnership  = positions.reduce((s, p) => s + p.ownershipPct, 0) / positions.length;
  const stakedCount   = positions.filter(p => p.isStaked).length;

  return (
    <div className="lp-summary-stats-grid">
      {[
        {
          label: 'Total LP Value',
          value: fmtUsd(totalUsd),
          color: 'var(--fg)',
          icon: <TrendingUp size={14} style={{ color: 'var(--chain-pulse)' }} />,
          bg: 'rgba(247,57,255,0.06)', border: 'rgba(247,57,255,0.14)',
        },
        {
          label: 'Fees Earned 24h',
          value: totalFees24h > 0 ? `+${fmtUsd(totalFees24h)}` : '-',
          color: totalFees24h > 0 ? 'var(--positive)' : 'var(--fg-subtle)',
          icon: <Zap size={14} style={{ color: 'var(--positive)' }} />,
          bg: totalFees24h > 0 ? 'rgba(0,255,159,0.06)' : 'var(--bg-inset)',
          border: totalFees24h > 0 ? 'rgba(0,255,159,0.14)' : 'var(--border-inset)',
        },
        {
          label: 'Active Positions',
          value: `${positions.length}`,
          color: 'var(--fg)',
          icon: <Droplets size={14} style={{ color: 'var(--chain-pulse)' }} />,
          bg: 'var(--bg-inset)', border: 'var(--border-inset)',
        },
        {
          label: 'Farming',
          value: stakedCount > 0 ? `${stakedCount} pool${stakedCount > 1 ? 's' : ''}` : 'None',
          color: stakedCount > 0 ? 'var(--chain-pulse)' : 'var(--fg-subtle)',
          icon: <Award size={14} style={{ color: stakedCount > 0 ? 'var(--chain-pulse)' : 'var(--fg-subtle)' }} />,
          bg: stakedCount > 0 ? 'rgba(247,57,255,0.06)' : 'var(--bg-inset)',
          border: stakedCount > 0 ? 'rgba(247,57,255,0.14)' : 'var(--border-inset)',
        },
      ].map(s => (
        <div key={s.label} style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '12px 14px', borderRadius: 12,
          background: s.bg, border: `1px solid ${s.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {s.icon}
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {s.label}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.03em' }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Section header -----------------------------------------------------------
interface SectionHeaderProps {
  positions: LpPositionEnriched[];
  loading: boolean;
  onRefetch: () => void;
  onViewAll?: () => void;
}

function SectionHeader({ positions, loading, onRefetch, onViewAll }: SectionHeaderProps) {
  const totalUsd = positions.reduce((s, p) => s + p.totalUsd, 0);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'rgba(247,57,255,0.12)', border: '1px solid rgba(247,57,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Droplets size={15} style={{ color: 'var(--chain-pulse)' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
              Liquidity Positions
            </span>
            {positions.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--chain-pulse)',
                background: 'rgba(247,57,255,0.10)', border: '1px solid rgba(247,57,255,0.22)',
                padding: '1px 8px', borderRadius: 100,
              }}>
                {positions.length}
              </span>
            )}
          </div>
          {positions.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, fontFamily: 'var(--font-shell-display)' }}>
              {fmtUsd(totalUsd)} total value
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={onRefetch}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--bg-inset)', color: 'var(--fg-muted)',
            fontSize: 12, fontWeight: 600, transition: 'all .15s',
          }}
          onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'var(--border)')}
          onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-inset)')}
          aria-label="Refresh liquidity positions"
        >
          <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        {onViewAll && (
          <button
            onClick={onViewAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
              borderRadius: 8, border: '1px solid rgba(247,57,255,0.22)',
              cursor: 'pointer', background: 'rgba(247,57,255,0.08)',
              color: 'var(--chain-pulse)', fontSize: 12, fontWeight: 700, transition: 'all .15s',
            }}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.16)')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.08)')}
          >
            View all <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// --- Hook auto-fetch helper ---------------------------------------------------
// Uses a stable ref so price changes (which recreate `refetch`) don't trigger
// a second RPC round-trip - only wallet list changes and the first price
// availability cause a re-fetch.
function useAutoFetch(
  walletAddresses: string[],
  refetch: () => void,
  tokenPrices: Record<string, number>,
) {
  const refetchRef = useRef(refetch);
  // Keep ref current after every render (no-dep effect runs first within same cycle)
  useEffect(() => { refetchRef.current = refetch; });

  const walletsKey = walletAddresses.join(',');
  useEffect(() => {
    if (walletAddresses.length > 0) refetchRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletsKey]);

  // Issue #2 - also re-fetch once when tokenPrices transitions from empty to
  // non-empty, so positions that loaded before prices were available get USD
  // values recalculated against real prices.
  const pricesReady = Object.keys(tokenPrices).length > 0;
  const prevPricesReady = useRef(false);
  useEffect(() => {
    if (pricesReady && !prevPricesReady.current && walletAddresses.length > 0) {
      refetchRef.current();
    }
    prevPricesReady.current = pricesReady;
  }, [pricesReady, walletAddresses.length]);
}

// --- OVERVIEW STRIP -----------------------------------------------------------
export interface LiquidityOverviewStripProps {
  walletAddresses: string[];
  tokenPrices: Record<string, number>;
  onViewAll: () => void;
}

export function LiquidityOverviewStrip({
  walletAddresses,
  tokenPrices,
  onViewAll,
}: LiquidityOverviewStripProps) {
  const { positions, loading, error, refetch } = useLiquidityPositions(walletAddresses, tokenPrices);
  useAutoFetch(walletAddresses, refetch, tokenPrices);

  // Render null only when definitively empty (not loading)
  if (!loading && positions.length === 0 && !error) return null;

  const displayPositions = positions.slice(0, 4);
  const remaining        = positions.length - 4;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid rgba(247,57,255,0.10)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(247,57,255,0.08)',
        background: 'linear-gradient(90deg, rgba(247,57,255,0.04) 0%, transparent 60%)',
      }}>
        <SectionHeader
          positions={positions}
          loading={loading}
          onRefetch={refetch}
          onViewAll={positions.length > 0 ? onViewAll : undefined}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          margin: '12px 18px', padding: '10px 14px', borderRadius: 10,
          background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.18)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--negative)',
        }}>
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && positions.length === 0 ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : (
          <>
            {displayPositions.map(pos => (
              <LiquidityPositionCard
                key={pos.pairAddress} pos={pos} compact onClick={onViewAll}
              />
            ))}
            {remaining > 0 && (
              <button
                onClick={onViewAll}
                style={{
                  marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 14px', borderRadius: 10,
                  background: 'rgba(247,57,255,0.06)', border: '1px solid rgba(247,57,255,0.14)',
                  cursor: 'pointer', color: 'var(--chain-pulse)', fontSize: 12, fontWeight: 700, transition: 'all .15s',
                }}
                onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.12)')}
                onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.06)')}
              >
                +{remaining} more position{remaining > 1 ? 's' : ''} <ChevronRight size={12} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- FULL DEFI PAGE ------------------------------------------------------------
export interface LiquiditySectionProps {
  walletAddresses: string[];
  tokenPrices: Record<string, number>;
}

export function LiquiditySection({ walletAddresses, tokenPrices }: LiquiditySectionProps) {
  const { positions, loading, error, refetch } = useLiquidityPositions(walletAddresses, tokenPrices);
  useAutoFetch(walletAddresses, refetch, tokenPrices);

  const stakedPositions  = positions.filter(p => p.isStaked);
  const regularPositions = positions.filter(p => !p.isStaked);
  const incPrice         = tokenPrices['INC'] ?? 0;

  return (
    <div className="space-y-5">
      {/* -- Page header -- */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(247,57,255,0.16) 0%, rgba(99,70,255,0.12) 100%)',
              border: '1px solid rgba(247,57,255,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(247,57,255,0.12)',
            }}>
              <Droplets size={20} style={{ color: 'var(--chain-pulse)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.025em', margin: 0 }}>
                DeFi Positions
              </h1>
              <p style={{ margin: 0, marginTop: 3 }}>PulseX V2 liquidity · INC farming · PulseChain</p>
            </div>
          </div>

          <button
            onClick={refetch}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: 10, border: '1px solid rgba(247,57,255,0.18)',
              cursor: 'pointer', background: 'rgba(247,57,255,0.07)', color: 'var(--chain-pulse)',
              fontSize: 12, fontWeight: 700, transition: 'all .15s',
            }}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.14)')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.07)')}
          >
            <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* -- Error -- */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.18)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: 'var(--negative)',
        }}>
          <AlertTriangle size={16} />
          <span>Failed to load positions: {error}</span>
        </div>
      )}

      {/* -- Summary stats (when data is available) -- */}
      {!loading && positions.length > 0 && (
        <LpSummaryStats positions={positions} />
      )}

      {/* -- Farming Rewards Banner -- */}
      {stakedPositions.length > 0 && (
        <FarmingRewardsBanner stakedPositions={stakedPositions} incPrice={incPrice} />
      )}

      {/* -- Loading skeletons -- */}
      {loading && positions.length === 0 && (
        <div className="asset-grid-3col">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* -- Farming positions (staked) -- */}
      {stakedPositions.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ height: 1, flex: 1, background: 'rgba(247,57,255,0.12)' }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--chain-pulse)',
              textTransform: 'uppercase', letterSpacing: '.7px',
              background: 'rgba(247,57,255,0.08)', border: '1px solid rgba(247,57,255,0.18)',
              padding: '3px 10px', borderRadius: 100,
            }}>
              Farming ({stakedPositions.length})
            </span>
            <div style={{ height: 1, flex: 1, background: 'rgba(247,57,255,0.12)' }} />
          </div>
          <div className="asset-grid-3col">
            {stakedPositions.map(pos => (
              <LiquidityPositionCard key={pos.pairAddress} pos={pos} />
            ))}
          </div>
        </>
      )}

      {/* -- Regular LP positions -- */}
      {regularPositions.length > 0 && (
        <>
          {stakedPositions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)',
                textTransform: 'uppercase', letterSpacing: '.7px',
                background: 'var(--bg-inset)', border: '1px solid var(--border)',
                padding: '3px 10px', borderRadius: 100,
              }}>
                LP Positions ({regularPositions.length})
              </span>
              <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
            </div>
          )}
          <div className="asset-grid-3col">
            {regularPositions.map(pos => (
              <LiquidityPositionCard key={pos.pairAddress} pos={pos} />
            ))}
          </div>
        </>
      )}

      {/* -- No wallets empty state -- */}
      {!loading && walletAddresses.length === 0 && (
        <div className="defi-empty-state">
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, rgba(0,255,159,0.10) 0%, rgba(99,70,255,0.08) 100%)',
            border: '1.5px solid rgba(0,255,159,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 28px rgba(0,255,159,0.08)',
          }}>
            <Wallet size={28} style={{ color: 'var(--accent)', opacity: 0.85 }} />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--fg)', marginBottom: 8, letterSpacing: '-0.02em' }}>
              No wallets added
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', maxWidth: 360, margin: '0 auto', lineHeight: 1.65 }}>
              Add a wallet address to see your PulseX V2 liquidity positions and INC farming rewards here.
            </div>
          </div>
        </div>
      )}

      {/* -- Empty state -- */}
      {!loading && walletAddresses.length > 0 && positions.length === 0 && !error && (
        <div className="defi-empty-state">
          {/* Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: 'linear-gradient(135deg, rgba(247,57,255,0.12) 0%, rgba(99,70,255,0.08) 100%)',
            border: '1.5px solid rgba(247,57,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 36px rgba(247,57,255,0.10)',
          }}>
            <Droplets size={32} style={{ color: 'var(--chain-pulse)', opacity: 0.85 }} />
          </div>
          {/* Heading */}
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--fg)', marginBottom: 8, letterSpacing: '-0.02em' }}>
              No LP or farming positions found
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', maxWidth: 380, margin: '0 auto', lineHeight: 1.65 }}>
              Provide liquidity on PulseX V2 to earn trading fees and INC farming rewards. Your positions will appear here automatically once detected on-chain.
            </div>
          </div>
          {/* Info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, width: '100%', maxWidth: 560, margin: '4px 0' }}>
            {[
              { icon: <Droplets size={18} />, title: 'Add Liquidity', desc: 'Deposit two tokens into a V2 pair to earn swap fees on every trade.' },
              { icon: <Zap size={18} />, title: 'Farm INC', desc: 'Stake your LP tokens in the MasterChef farm to earn INC rewards daily.' },
              { icon: <TrendingUp size={18} />, title: 'Track Returns', desc: 'Your USD value, token amounts, and pending rewards update in real time.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="defi-empty-info-card">
                <div style={{ color: 'var(--chain-pulse)', opacity: 0.8 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href="https://pulsex.com/#/add/v2"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '11px 24px', borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(247,57,255,0.18) 0%, rgba(99,70,255,0.12) 100%)',
                border: '1px solid rgba(247,57,255,0.32)',
                color: 'var(--chain-pulse)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                transition: 'all .15s',
              }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(247,57,255,0.28) 0%, rgba(99,70,255,0.20) 100%)')}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(247,57,255,0.18) 0%, rgba(99,70,255,0.12) 100%)')}
            >
              <Droplets size={14} /> Add Liquidity on PulseX <ExternalLink size={12} />
            </a>
            <a
              href="https://pulsex.com/#/farm"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '11px 22px', borderRadius: 10,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--fg-muted)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                transition: 'all .15s',
              }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg)'; }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'; }}
            >
              <Zap size={14} /> Explore Farms <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

