import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
} from 'lucide-react';
import type { Transaction, Asset } from '../types';

// --- Props --------------------------------------------------------------------
export interface TokenPnLCardProps {
  /** The single token being analysed (= txAssetFilter value, never 'all') */
  symbol: string;
  /** All transactions already filtered to this symbol (type + chain filters
   *  may still be applied externally, but asset filter MUST match symbol) */
  transactions: Transaction[];
  /** Live asset record for this token (for current balance + price) */
  asset: Asset | undefined;
  /** Current USD price per token */
  priceUsd: number;
  /** Native PLS price (to convert gas fees) */
  plsPriceUsd: number;
  /** Token logo URL (optional) */
  logoUrl?: string;
  /** Optional action to refresh full swap/transaction data for more accurate P&L. */
  onSyncSwaps?: () => void;
  /** Loading state for the sync action. */
  isSyncing?: boolean;
}

// --- Helpers ------------------------------------------------------------------
function fmtUsd(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000)    return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function fmtTok(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}K`;
  return abs.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
function formatSign(n: number): string { return n >= 0 ? '+' : '−'; }
function getProfitLossColor(n: number): string {
  return n >= 0 ? 'var(--positive)' : 'var(--negative)';
}
function normalizeSymbol(symbol: string): string {
  const upper = (symbol || '').toUpperCase();
  return upper === 'WPLS' ? 'PLS' : upper;
}
function sameSymbol(left: string, right: string): boolean {
  return normalizeSymbol(left) === normalizeSymbol(right);
}

// --- Sub-components -----------------------------------------------------------
function StatRow({
  label, value, valueColor, sub,
}: {
  label: string; value: string; valueColor?: string; sub?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.55px' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: valueColor ?? 'var(--fg)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{sub}</span>}
    </div>
  );
}

function Divider({ vertical }: { vertical?: boolean }) {
  return (
    <div style={vertical
      ? { width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }
      : { height: 1, background: 'var(--border)' }} />
  );
}

function TokenLogo({ symbol, logoUrl, size = 36 }: { symbol: string; logoUrl?: string; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, rgba(247,57,255,0.18) 0%, rgba(99,70,255,0.12) 100%)`,
      border: `1.5px solid rgba(247,57,255,0.28)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', fontSize: Math.round(size * 0.38), fontWeight: 800, color: 'var(--chain-pulse)',
    }}>
      {logoUrl && !imgErr ? (
        <img src={logoUrl} alt={symbol}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          onError={() => setImgErr(true)} />
      ) : symbol[0].toUpperCase()}
    </div>
  );
}

// --- Main component -----------------------------------------------------------
export function TokenPnLCard({
  symbol,
  transactions,
  asset,
  priceUsd,
  plsPriceUsd,
  logoUrl,
  onSyncSwaps,
  isSyncing,
}: TokenPnLCardProps) {
  const [expanded, setExpanded] = useState(true);

  // -- Compute P&L -------------------------------------------------------------
  const {
    totalCost: _legacyTotalCost, totalProceeds: _legacyTotalProceeds, realizedPnl: _legacyRealizedPnl,
    buyCount, sellCount, transferInCount, transferOutCount,
    gasFeePls, gasFeeUsd,
    swapCount,
  } = useMemo(() => {
    let totalCost = 0;
    let totalProceeds = 0;
    let buyCount = 0;
    let sellCount = 0;
    let transferInCount = 0;
    let transferOutCount = 0;
    let swapCount = 0;
    let gasFeePls = 0;

    transactions.forEach(tx => {
      const usd = tx.valueUsd ?? 0;
      gasFeePls += tx.fee ?? 0;

      if (tx.type === 'swap') {
        swapCount++;
        if (sameSymbol(tx.asset, symbol)) {
          // Received symbol (bought it) - usd is what we got
          totalCost += usd;
          buyCount++;
        } else if (sameSymbol(tx.counterAsset ?? '', symbol)) {
          // Spent symbol (sold it) - usd is what we received back
          totalProceeds += usd;
          sellCount++;
        }
      } else if (tx.type === 'deposit') {
        // Received symbol for free / via bridge
        totalCost += usd; // at market value at time of receipt
        transferInCount++;
      } else if (tx.type === 'withdraw') {
        // Sent symbol away - treat as proceeds at the time
        totalProceeds += usd;
        transferOutCount++;
      }
    });

    const realizedPnl = totalProceeds - totalCost;
    const gasFeeUsd   = gasFeePls * plsPriceUsd;

    return {
      totalCost, totalProceeds, realizedPnl,
      buyCount, sellCount, transferInCount, transferOutCount,
      gasFeePls, gasFeeUsd, swapCount,
    };
  }, [transactions, symbol, plsPriceUsd]);

  // -- Current holdings ---------------------------------------------------------
  const currentBalance = asset?.balance ?? 0;
  const currentValue   = currentBalance * priceUsd;

  const pnl = useMemo(() => {
    let cost = 0;
    let proceeds = 0;
    let bought = 0;
    let sold = 0;

    transactions.forEach(tx => {
      const usd = tx.valueUsd ?? 0;
      const assetMatches = sameSymbol(tx.asset, symbol);
      const counterMatches = sameSymbol(tx.counterAsset ?? '', symbol);

      if (tx.type === 'swap') {
        if (assetMatches) {
          bought += tx.amount;
          cost += usd;
        }
        if (counterMatches) {
          sold += tx.counterAmount ?? 0;
          proceeds += usd;
        }
      } else if (tx.type === 'deposit' && assetMatches) {
        bought += tx.amount;
        cost += usd;
      } else if (tx.type === 'withdraw' && assetMatches) {
        sold += tx.amount;
        proceeds += usd;
      }
    });

    const avgCost = bought > 0 ? cost / bought : 0;
    const realizedCost = Math.min(cost, sold * avgCost);
    const realized = proceeds - realizedCost;
    const remainingCost = Math.max(0, cost - realizedCost);
    const unrealized = currentValue - remainingCost;
    const total = realized + unrealized - gasFeeUsd;
    const pct = cost > 0 ? (total / cost) * 100 : null;

    return { cost, proceeds, realized, remainingCost, unrealized, total, pct };
  }, [transactions, symbol, currentValue, gasFeeUsd]);

  const totalCost = pnl.cost;
  const totalProceeds = pnl.proceeds;
  const realizedPnl = pnl.realized;
  const totalPnl = pnl.total;

  const txCount = transactions.length;

  // Build a summary of swap activity for the breakdown label
  const activityParts: string[] = [];
  if (swapCount > 0) activityParts.push(`${swapCount} swap${swapCount > 1 ? 's' : ''}`);
  if (transferInCount > 0) activityParts.push(`${transferInCount} received`);
  if (transferOutCount > 0) activityParts.push(`${transferOutCount} sent`);
  const activityLabel = activityParts.length > 0
    ? activityParts.join(' · ')
    : `${txCount} transactions`;

  const totalPnlColor = getProfitLossColor(totalPnl);
  const realPnlColor  = getProfitLossColor(pnl.realized);

  const realPct = pnl.pct;

  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(247,57,255,0.07) 0%, rgba(99,70,255,0.04) 50%, var(--bg-inset) 100%)',
      border: '1px solid rgba(247,57,255,0.18)',
      borderRadius: 16,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top purple accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(247,57,255,0.55), transparent)',
        pointerEvents: 'none',
      }} />

      {/* -- Header -- */}
      <div
        className="pnl-card-header"
        style={{
          borderBottom: expanded ? '1px solid rgba(247,57,255,0.10)' : 'none',
          cursor: 'pointer',
          background: 'linear-gradient(90deg, rgba(247,57,255,0.04) 0%, transparent 60%)',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
          <TokenLogo symbol={symbol} logoUrl={logoUrl} size={38} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.015em' }}>
                {symbol}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: 'var(--chain-pulse)',
                background: 'rgba(247,57,255,0.10)', border: '1px solid rgba(247,57,255,0.22)',
                padding: '1px 7px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '.5px',
              }}>
                P&amp;L Analysis
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
              {activityLabel}
              {txCount > 0 && (
                <span style={{ color: 'var(--fg-subtle)', marginLeft: 4 }}>
                  · {txCount} total
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Total P&L hero number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.55px', marginBottom: 3 }}>
              Total P&amp;L
            </div>
            <div style={{
              fontSize: 'clamp(16px, 4.5vw, 22px)', fontWeight: 800, color: totalPnlColor,
              fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.04em',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {totalPnl >= 0
                ? <TrendingUp size={16} style={{ color: totalPnlColor, flexShrink: 0 }} />
                : <TrendingDown size={16} style={{ color: totalPnlColor, flexShrink: 0 }} />}
              {formatSign(totalPnl)}{fmtUsd(totalPnl)}
            </div>
            {realPct !== null && (
              <div style={{ fontSize: 11, color: totalPnlColor, fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em', textAlign: 'right', marginTop: 1 }}>
                {formatSign(realPct)}{Math.abs(realPct).toFixed(1)}% on cost
              </div>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 4, flexShrink: 0, display: 'flex' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* -- Body (collapsible) -- */}
      {expanded && (
        <div style={{ padding: '16px 18px 14px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(0,255,159,0.08), rgba(139,92,246,0.08))',
            border: '1px solid rgba(0,255,159,0.16)',
          }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg)', letterSpacing: '.01em' }}>
                Load all swaps for accurate P&L
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.35 }}>
                Sync transactions to include swaps, transfers, and bridge events before relying on realized profit.
              </span>
            </div>
            {onSyncSwaps && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={e => {
                  e.stopPropagation();
                  onSyncSwaps();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  flexShrink: 0,
                  minHeight: 30,
                  padding: '7px 11px',
                  borderRadius: 8,
                  border: '1px solid rgba(0,255,159,0.32)',
                  background: isSyncing ? 'rgba(0,255,159,0.10)' : 'rgba(0,255,159,0.16)',
                  color: 'var(--accent)',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: isSyncing ? 'default' : 'pointer',
                  opacity: isSyncing ? 0.72 : 1,
                }}>
                <RefreshCcw size={12} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing' : 'Sync swaps'}
              </button>
            )}
          </div>

          {/* Two-column breakdown */}
          <div className="pnl-cols">

            {/* -- LEFT: Realized -- */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '14px 16px',
              background: 'var(--bg-inset)',
              borderRadius: 12, border: '1px solid var(--border-inset)',
            }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BarChart2 size={11} style={{ color: '#8b5cf6' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  Realized
                </span>
              </div>

              <StatRow
                label="Total Cost"
                value={totalCost > 0 ? `−${fmtUsd(totalCost)}` : '-'}
                valueColor={totalCost > 0 ? 'var(--negative)' : 'var(--fg-subtle)'}
                sub={buyCount > 0
                  ? `${buyCount} buy${buyCount > 1 ? 's' : ''}${transferInCount > 0 ? ` · ${transferInCount} received` : ''}`
                  : transferInCount > 0 ? `${transferInCount} received` : undefined}
              />
              <Divider />
              <StatRow
                label="Total Proceeds"
                value={totalProceeds > 0 ? `+${fmtUsd(totalProceeds)}` : '-'}
                valueColor={totalProceeds > 0 ? 'var(--positive)' : 'var(--fg-subtle)'}
                sub={sellCount > 0
                  ? `${sellCount} sell${sellCount > 1 ? 's' : ''}${transferOutCount > 0 ? ` · ${transferOutCount} sent` : ''}`
                  : transferOutCount > 0 ? `${transferOutCount} sent` : undefined}
              />
              <Divider />

              {/* Net Realized P&L - prominent */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10,
                background: realizedPnl >= 0 ? 'rgba(0,255,159,0.05)' : 'rgba(244,63,94,0.05)',
                border: `1px solid ${realizedPnl >= 0 ? 'rgba(0,255,159,0.14)' : 'rgba(244,63,94,0.14)'}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.55px' }}>
                  Net Realized
                </span>
                <span style={{
                  fontSize: 15, fontWeight: 800, color: realPnlColor,
                  fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.03em',
                }}>
                  {formatSign(realizedPnl)}{fmtUsd(Math.abs(realizedPnl))}
                </span>
              </div>
            </div>

            {/* -- RIGHT: Holdings -- */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: '14px 16px',
              background: 'var(--bg-inset)',
              borderRadius: 12, border: '1px solid var(--border-inset)',
            }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: 'rgba(247,57,255,0.10)', border: '1px solid rgba(247,57,255,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wallet size={11} style={{ color: 'var(--chain-pulse)' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  Holdings
                </span>
              </div>

              <StatRow
                label="Current Balance"
                value={currentBalance > 0 ? fmtTok(currentBalance) + ' ' + symbol : '-'}
                sub={currentBalance > 0 ? 'Live on-chain' : 'Nothing held currently'}
              />
              <Divider />
              <StatRow
                label="Current Value"
                value={currentValue > 0 ? fmtUsd(currentValue) : '-'}
                valueColor={currentValue > 0 ? 'var(--fg)' : 'var(--fg-subtle)'}
                sub={priceUsd > 0
                  ? `@ ${priceUsd < 0.001
                    ? priceUsd.toExponential(3)
                    : priceUsd < 1
                    ? `$${priceUsd.toFixed(6)}`
                    : fmtUsd(priceUsd, 4)} per ${symbol}`
                  : undefined}
              />
              <Divider />

              {/* Unrealized P&L - current value as "unrealized" */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10,
                background: pnl.unrealized >= 0 ? 'rgba(0,255,159,0.05)' : 'rgba(244,63,94,0.05)',
                border: '1px solid rgba(247,57,255,0.12)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.55px' }}>
                  Unrealized
                </span>
                <span style={{
                  fontSize: 15, fontWeight: 800, color: pnl.unrealized >= 0 ? 'var(--positive)' : 'var(--negative)',
                  fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.03em',
                }}>
                  {formatSign(pnl.unrealized)}{fmtUsd(Math.abs(pnl.unrealized))}
                </span>
              </div>
            </div>
          </div>

          {/* -- Bottom bar: gas + links -- */}
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            padding: '9px 12px', borderRadius: 10,
            background: 'var(--bg-inset)', border: '1px solid var(--border-inset)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {gasFeePls > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Gas:
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-shell-display)', color: 'var(--fg-muted)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {fmtTok(gasFeePls)} PLS
                  </span>
                  {plsPriceUsd > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--fg-subtle)', fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                      ({fmtUsd(gasFeePls * plsPriceUsd, 4)})
                    </span>
                  )}
                </div>
              )}
              {gasFeePls === 0 && (
                <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                  Gas data not available for these transactions
                </span>
              )}
            </div>
            <a
              href={`https://scan.pulsechain.com/search?q=${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, color: 'var(--fg-subtle)',
                textDecoration: 'none', transition: 'color .12s',
              }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.color = 'var(--chain-pulse)')}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)')}
            >
              Explorer <ExternalLink size={10} />
            </a>
          </div>

          {/* -- Disclaimer note -- */}
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--fg-subtle)', lineHeight: 1.5, textAlign: 'center' }}>
            P&amp;L is estimated from on-chain transaction values at time of execution.
            Cost = USD value of acquisitions · Proceeds = USD value of disposals.
          </div>
        </div>
      )}
    </div>
  );
}
