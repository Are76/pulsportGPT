import React from 'react';
import { ChevronRight, ExternalLink, ArrowUpRight } from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import type { LpPositionEnriched } from '../types';
import { fmtUsd, fmtTok } from '../lib/utils';

// --- Token logo URL ------------------------------------------------------------
function tokenLogoUrl(address: string): string {
  return `https://tokens.app.pulsex.com/images/tokens/${address}.png`;
}

// --- Token Logo ---------------------------------------------------------------
interface TokenLogoProps {
  address: string;
  symbol: string;
  size: number;
  zIndex?: number;
  style?: React.CSSProperties;
}

function TokenLogo({ address, symbol, size, zIndex = 1, style }: TokenLogoProps) {
  const [imgError, setImgError] = React.useState(false);
  const initials = symbol.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: imgError
        ? 'linear-gradient(135deg, rgba(247,57,255,0.18) 0%, rgba(99,70,255,0.18) 100%)'
        : 'transparent',
      border: '2px solid rgba(247,57,255,0.22)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 800, color: 'var(--chain-pulse)',
      overflow: 'hidden', flexShrink: 0, position: 'relative', zIndex,
      boxShadow: '0 0 0 1.5px rgba(0,0,0,0.4)',
      ...style,
    }}>
      {!imgError ? (
        <img
          src={tokenLogoUrl(address)}
          alt={symbol}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          onError={() => setImgError(true)}
        />
      ) : initials}
    </div>
  );
}

// --- Overlapping Pair Logos ----------------------------------------------------
interface PairLogosProps {
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  size?: number;
}

function PairLogos({ token0Address, token1Address, token0Symbol, token1Symbol, size = 36 }: PairLogosProps) {
  const overlap = Math.round(size * 0.38);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, width: size * 2 - overlap }}>
      <TokenLogo address={token0Address} symbol={token0Symbol} size={size} zIndex={2} />
      <TokenLogo address={token1Address} symbol={token1Symbol} size={size} zIndex={1}
        style={{ marginLeft: -overlap }} />
    </div>
  );
}

// --- IL Badge -----------------------------------------------------------------
function ILBadge({ il }: { il: number | null }) {
  if (il === null) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-shell-display)',
        color: 'var(--fg-subtle)', background: 'var(--bg-inset)',
        padding: '3px 9px', borderRadius: 100,
        border: '1px solid var(--border-inset)',
        letterSpacing: '.01em',
      }}>
        IL: N/A
      </span>
    );
  }
  const isPos = il >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-shell-display)',
      color: isPos ? 'var(--positive)' : 'var(--negative)',
      background: isPos ? 'var(--accent-dim)' : 'rgba(244,63,94,0.08)',
      padding: '3px 9px', borderRadius: 100,
      border: `1px solid ${isPos ? 'var(--accent-border)' : 'rgba(244,63,94,0.22)'}`,
      letterSpacing: '.01em',
    }}>
      IL: {il >= 0 ? '+' : ''}{il.toFixed(2)}%
    </span>
  );
}

// --- Sparkline ----------------------------------------------------------------
function Sparkline({ data, w, h, id }: {
  data: { t: number; v: number }[];
  w?: number | string;
  h: number;
  id: string;
}) {
  const gradId = `lp-grad-${id}`;
  const isPositive = data.length < 2 || data[data.length - 1].v >= data[0].v;
  const color = isPositive ? 'var(--accent)' : '#f43f5e';
  return (
    <div style={{ width: w ?? '100%', height: h, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey="v"
            stroke={color} strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false} isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Token Breakdown Box ------------------------------------------------------
interface TokenBoxProps {
  address: string;
  symbol: string;
  amount: number;
  usd: number;
  weightPct: number;
  priceUsd: number;
}

function TokenBox({ address, symbol, amount, usd, weightPct, priceUsd }: TokenBoxProps) {
  return (
    <div style={{
      background: 'var(--bg-inset)',
      border: '1px solid var(--border-inset)',
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Symbol row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TokenLogo address={address} symbol={symbol} size={24} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>{symbol}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-subtle)', fontFamily: 'var(--font-shell-display)' }}>
          {weightPct.toFixed(1)}%
        </span>
      </div>
      {/* Weight bar */}
      <div style={{
        height: 3, background: 'var(--border-inset)', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(weightPct, 100)}%`, height: '100%',
          background: 'var(--accent)',
          borderRadius: 2, transition: 'width 0.4s var(--ease-spring)',
        }} />
      </div>
      {/* Amount */}
      <div>
        <div style={{
          fontSize: 14, fontWeight: 700, color: 'var(--fg)',
          fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em',
        }}>
          {fmtTok(amount)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-shell-display)' }}>
            {fmtUsd(usd)}
          </span>
          {priceUsd > 0 && (
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)', fontFamily: 'var(--font-shell-display)' }}>
              @ {priceUsd < 0.001 ? priceUsd.toExponential(2) : fmtUsd(priceUsd, 4)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Stat Pill ----------------------------------------------------------------
function StatPill({ label, value, color, bg, border }: {
  label: string;
  value: string;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em' }}>
        {value}
      </span>
    </div>
  );
}

// --- FULL CARD ----------------------------------------------------------------
function LiquidityPositionCardFull({ pos }: { pos: LpPositionEnriched }) {
  const totalUsd  = pos.totalUsd;
  const tok0Pct   = totalUsd > 0 ? (pos.token0Usd / totalUsd) * 100 : 50;
  const tok1Pct   = 100 - tok0Pct;
  const sparkId   = pos.pairAddress.slice(-8);

  return (
    <div className="lp-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* -- Top accent line rendered by CSS ::before -- */}

      {/* -- Header: logos + pair name + value ------- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <PairLogos
            token0Address={pos.token0Address} token1Address={pos.token1Address}
            token0Symbol={pos.token0Symbol}   token1Symbol={pos.token1Symbol}
            size={40}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 17, fontWeight: 800, color: 'var(--fg)',
                letterSpacing: '-0.025em', lineHeight: 1.2,
              }}>
                {pos.pairName}
              </span>
              {pos.isStaked && (
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '.6px',
                  textTransform: 'uppercase', color: 'var(--chain-pulse)',
                  background: 'rgba(247,57,255,0.12)',
                  border: '1px solid rgba(247,57,255,0.28)',
                  padding: '2px 8px', borderRadius: 100,
                }}>
                  FARMING
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 3, letterSpacing: '.01em' }}>
              PulseX V2 · PulseChain
            </div>
          </div>
        </div>

        {/* USD value - top right */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 22, fontWeight: 800, color: 'var(--fg)',
            fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.04em', lineHeight: 1,
          }}>
            {fmtUsd(totalUsd)}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4,
            fontFamily: 'var(--font-shell-display)',
          }}>
            {pos.ownershipPct.toFixed(4)}% of pool
          </div>
        </div>
      </div>

      {/* -- Divider -- */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* -- Token Amount Row -- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <TokenBox
          address={pos.token0Address} symbol={pos.token0Symbol}
          amount={pos.token0Amount}   usd={pos.token0Usd}
          weightPct={tok0Pct}         priceUsd={pos.token0PriceUsd}
        />
        <TokenBox
          address={pos.token1Address} symbol={pos.token1Symbol}
          amount={pos.token1Amount}   usd={pos.token1Usd}
          weightPct={tok1Pct}         priceUsd={pos.token1PriceUsd}
        />
      </div>

      {/* -- Stats pills -- */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* IL */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          background: pos.ilEstimate === null
            ? 'var(--bg-inset)'
            : pos.ilEstimate >= 0
              ? 'var(--accent-dim)' : 'rgba(244,63,94,0.06)',
          border: `1px solid ${
            pos.ilEstimate === null
              ? 'var(--border-inset)'
              : pos.ilEstimate >= 0
                ? 'var(--accent-border)' : 'rgba(244,63,94,0.18)'}`,
          borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 80,
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Imp. Loss
          </span>
          <span style={{
            fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em',
            fontFamily: 'var(--font-shell-display)',
            color: pos.ilEstimate === null
              ? 'var(--fg-subtle)'
              : pos.ilEstimate >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}>
            {pos.ilEstimate === null ? 'N/A' : `${pos.ilEstimate >= 0 ? '+' : ''}${pos.ilEstimate.toFixed(2)}%`}
          </span>
        </div>

        <StatPill
          label="Fees 24h"
          value={pos.fees24hUsd != null && pos.fees24hUsd > 0 ? `+${fmtUsd(pos.fees24hUsd)}` : '-'}
          color={pos.fees24hUsd != null && pos.fees24hUsd > 0 ? 'var(--positive)' : 'var(--fg-subtle)'}
          bg={pos.fees24hUsd != null && pos.fees24hUsd > 0 ? 'var(--accent-dim)' : 'var(--bg-inset)'}
          border={pos.fees24hUsd != null && pos.fees24hUsd > 0 ? 'var(--accent-border)' : 'var(--border-inset)'}
        />

        {pos.volume24hUsd != null && (
          <StatPill
            label="Vol 24h"
            value={fmtUsd(pos.volume24hUsd, 0)}
            color="var(--fg)"
            bg="var(--bg-inset)"
            border="var(--border-inset)"
          />
        )}

        {pos.isStaked && (pos.pendingIncUsd ?? 0) > 0 && (
          <StatPill
            label="Pending INC"
            value={`+${fmtUsd(pos.pendingIncUsd!)}`}
            color="var(--chain-pulse)"
            bg="rgba(247,57,255,0.06)"
            border="rgba(247,57,255,0.18)"
          />
        )}
      </div>

      {/* -- Sparkline -- */}
      <div style={{ borderRadius: 10, overflow: 'hidden', margin: '0 -2px' }}>
        <Sparkline data={pos.sparkline} h={48} id={sparkId} />
      </div>

      {/* -- Footer: LP balance + action buttons -- */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{
          fontSize: 11, color: 'var(--fg-subtle)',
          fontFamily: 'var(--font-shell-display)',
        }}>
          {pos.walletLpBalance > 0 && pos.stakedLpBalance > 0 ? (
            <>
              Wallet: {pos.walletLpBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })}
              {' · '}
              Staked: {pos.stakedLpBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })}
            </>
          ) : pos.stakedLpBalance > 0 ? (
            <>Staked LP: {pos.stakedLpBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })}</>
          ) : (
            <>LP Balance: {pos.walletLpBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })}</>
          )}
        </span>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Remove Liquidity link -> PulseX */}
          <a
            href={`https://pulsex.com/#/remove/${pos.token0Address}/${pos.token1Address}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, color: 'var(--negative)',
              background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.18)',
              padding: '5px 11px', borderRadius: 8, textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.14)')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.07)')}
          >
            Remove
          </a>
          {/* Manage -> PulseX add liq */}
          <a
            href={`https://pulsex.com/#/add/${pos.token0Address}/${pos.token1Address}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, color: 'var(--chain-pulse)',
              background: 'rgba(247,57,255,0.08)', border: '1px solid rgba(247,57,255,0.22)',
              padding: '5px 11px', borderRadius: 8, textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.16)')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(247,57,255,0.08)')}
          >
            Manage <ArrowUpRight size={10} />
          </a>
          {/* View pair on explorer */}
          <a
            href={`https://scan.pulsechain.com/address/${pos.pairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
              padding: '5px 8px', borderRadius: 8, textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseOver={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg)')}
            onMouseOut={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)')}
            title="View pair on explorer"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

// --- COMPACT CARD (overview strip) --------------------------------------------
function LiquidityPositionCardCompact({ pos, onClick }: {
  pos: LpPositionEnriched;
  onClick?: () => void;
}) {
  return (
    <div
      className="lp-card-compact"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {/* Pair logos */}
      <PairLogos
        token0Address={pos.token0Address} token1Address={pos.token1Address}
        token0Symbol={pos.token0Symbol}   token1Symbol={pos.token1Symbol}
        size={26}
      />

      {/* Name + token amounts */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
            {pos.pairName}
          </span>
          {pos.isStaked && (
            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--chain-pulse)', flexShrink: 0 }}>
              FARMING
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--fg-muted)',
          fontFamily: 'var(--font-shell-display)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginTop: 2,
        }}>
          {fmtTok(pos.token0Amount)}&nbsp;{pos.token0Symbol}
          <span style={{ color: 'var(--fg-subtle)', margin: '0 4px' }}>+</span>
          {fmtTok(pos.token1Amount)}&nbsp;{pos.token1Symbol}
        </div>
      </div>

      {/* Mini sparkline */}
      <Sparkline data={pos.sparkline} w={56} h={28} id={`compact-${pos.pairAddress.slice(-6)}`} />

      {/* USD value + ownership */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 800, color: 'var(--fg)',
          fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em',
        }}>
          {fmtUsd(pos.totalUsd)}
        </div>
        {pos.ilEstimate !== null && (
          <div style={{
            fontSize: 10, fontWeight: 700, marginTop: 2,
            fontFamily: 'var(--font-shell-display)',
            color: pos.ilEstimate >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}>
            IL {pos.ilEstimate >= 0 ? '+' : ''}{pos.ilEstimate.toFixed(2)}%
          </div>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight size={14} style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
    </div>
  );
}

// --- PUBLIC EXPORT ------------------------------------------------------------
export interface LiquidityPositionCardProps {
  key?: React.Key;
  pos: LpPositionEnriched;
  compact?: boolean;
  onClick?: () => void;
}

export function LiquidityPositionCard({ pos, compact = false, onClick }: LiquidityPositionCardProps) {
  if (compact) return <LiquidityPositionCardCompact pos={pos} onClick={onClick} />;
  return <LiquidityPositionCardFull pos={pos} />;
}

