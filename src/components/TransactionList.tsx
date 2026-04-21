/**
 * TransactionList - the single unified transaction card component.
 *
 * This is the canonical reference implementation used across ALL views:
 *   - History tab (full mode, expand-in-place P&L detail)
 *   - Wallets tab (compact mode, filtered by wallet)
 *   - Assets tab (compact mode, filtered by token)
 *
 * Design reference: "Recent Activity" on the Transaction History page.
 *
 * Features:
 *   - Expand-in-place detail panels (click any card)
 *   - Swap detail: Trade P/L + Dollar P/L cards, received/spent legs with then->now price
 *   - Deposit/withdraw detail: stats grid (amount, USD value, current price, P/L, chain, date)
 *   - "View as You": resolves wallet addresses to "You" or wallet name
 *   - Compact mode: smaller padding, icon hidden, less info per row
 *   - On-chain performance: calculates current value vs entry value
 *   - Hide/show per transaction
 *   - Filter-by-asset shortcut button
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, RefreshCcw,
  ExternalLink, EyeOff, Eye,
  ChevronDown, ChevronUp,
  Filter, TrendingUp, TrendingDown,
  ArrowLeftRight,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { Transaction } from '../types';
import type { Asset, Wallet } from '../types';

// -- Constants -----------------------------------------------------------------
const EXPLORER: Record<string, string> = {
  pulsechain: 'https://scan.pulsechain.com',
  ethereum:   'https://etherscan.io',
  base:       'https://basescan.org',
};

const CHAIN_DOT: Record<string, string> = {
  pulsechain: '#f739ff',
  ethereum:   '#627EEA',
  base:       '#0052ff',
};

const CHAIN_LABEL: Record<string, string> = {
  pulsechain: 'PLS',
  ethereum:   'ETH',
  base:       'BASE',
};

const normalizeSymbol = (symbol: string, chain?: string): string => {
  const upper = (symbol || '').toUpperCase();
  return chain === 'pulsechain' && upper === 'WPLS' ? 'PLS' : upper;
};

// -- Helpers -------------------------------------------------------------------
function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function fmtPrice(p: number): string {
  if (p <= 0) return '-';
  if (p < 0.001) return `$${p.toFixed(8)}`;
  if (p < 1)     return `$${p.toFixed(6)}`;
  return `$${p.toFixed(4)}`;
}

function fmtPnl(n: number): string {
  const abs = Math.abs(n);
  const dp = abs < 0.001 ? 6 : abs < 0.1 ? 4 : 2;
  return `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(dp)}`;
}

function txVisual(type: Transaction['type']) {
  switch (type) {
    case 'deposit':  return { Icon: ArrowDownLeft, bg: 'rgba(0,255,159,.10)', color: 'var(--accent)',  label: 'Received' } as const;
    case 'withdraw': return { Icon: ArrowUpRight,  bg: 'rgba(239,68,68,.10)',  color: '#ef4444',        label: 'Sent'     } as const;
    case 'swap':     return { Icon: RefreshCcw,    bg: 'rgba(139,92,246,.10)', color: '#8b5cf6',        label: 'Swap'     } as const;
  }
}

// -- Props ---------------------------------------------------------------------
export interface TransactionListProps {
  transactions: Transaction[];
  /** Resolve wallet addresses to "You" / wallet name */
  viewAsYou?: boolean;
  wallets?: Wallet[];
  /** Compact card variant - smaller padding, icon hidden */
  compact?: boolean;
  /** Current asset holdings - used to compute current prices / P&L */
  assets?: Asset[];
  /** Called with an Asset to return its logo URL */
  getTokenLogoUrl?: (asset: Asset) => string;
  /** Logo URLs keyed by lowercase symbol (fallback) */
  tokenLogos?: Record<string, string>;
  /** IDs of transactions the user has hidden */
  hideIds?: string[];
  /** Toggle a transaction's hidden state */
  onToggleHide?: (id: string) => void;
  /** Show hidden rows at reduced opacity */
  showHidden?: boolean;
  /** Called when the user clicks the token logo filter shortcut */
  onFilterByAsset?: (symbol: string) => void;
  /** Shown when the list is empty */
  emptyMessage?: string;
}

// -- Liberty Swap chain names --------------------------------------------------
const LS_CHAIN_NAMES: Record<number, string> = {
  1:     'Ethereum',
  56:    'BNB Chain',
  137:   'Polygon',
  369:   'PulseChain',
  8453:  'Base',
  42161: 'Arbitrum',
  10:    'Optimism',
};

function LibertySwapPanel({ dstChainId, orderId }: { dstChainId: number; orderId: string }) {
  const dstChainName = LS_CHAIN_NAMES[dstChainId] ?? `Chain ${dstChainId}`;
  const shortOrder = orderId.length > 14 ? `${orderId.slice(0, 8)}...${orderId.slice(-6)}` : orderId;

  return (
    <div style={{
      marginTop: 10,
      background: 'rgba(98,126,234,0.06)',
      border: '1px solid rgba(98,126,234,0.22)',
      borderRadius: 10,
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: 'rgba(98,126,234,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ArrowLeftRight size={12} color="#627EEA" />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#627EEA' }}>Liberty Swap Bridge</span>
        <a
          href="https://libertyswap.finance"
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ marginLeft: 'auto', color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center' }}
        >
          <ExternalLink size={11} />
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 10px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Destination</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{dstChainName}</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 10px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Order ID</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{shortOrder}</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 8, lineHeight: 1.5 }}>
        Intent-based cross-chain swap via Liberty Swap. Records deleted after 48 hrs.
      </div>
    </div>
  );
}

// --- Component ----------------------------------------------------------------
export function TransactionList({
  transactions,
  viewAsYou = false,
  wallets = [],
  compact = false,
  assets = [],
  getTokenLogoUrl,
  tokenLogos = {},
  hideIds = [],
  onToggleHide,
  showHidden = false,
  onFilterByAsset,
  emptyMessage = 'No transactions found.',
}: TransactionListProps) {
  // Internal expansion state - no parent needed
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const walletSet = useMemo(
    () => new Set(wallets.map(w => w.address.toLowerCase())),
    [wallets],
  );

  const isOwn = useCallback(
    (addr: string | undefined): boolean =>
      viewAsYou && !!addr && walletSet.has(addr.toLowerCase()),
    [viewAsYou, walletSet],
  );

  const displayAddr = useCallback(
    (addr: string | undefined): string => {
      if (!addr) return '?';
      if (!viewAsYou) return shortAddr(addr);
      const lower = addr.toLowerCase();
      if (walletSet.has(lower)) {
        const w = wallets.find(w => w.address.toLowerCase() === lower);
        return w?.name || 'You';
      }
      return shortAddr(addr);
    },
    [viewAsYou, wallets, walletSet],
  );

  const findAsset = useCallback(
    (symbol: string, chain: string): Asset | undefined =>
      assets.find(a => normalizeSymbol(a.symbol, a.chain) === normalizeSymbol(symbol, chain) && a.chain === chain),
    [assets],
  );

  const getLogoUrl = useCallback(
    (symbol: string, chain: string): string => {
      const asset = findAsset(symbol, chain);
      if (asset && getTokenLogoUrl) return getTokenLogoUrl(asset);
      return tokenLogos[symbol.toLowerCase()] ?? tokenLogos[symbol] ?? '';
    },
    [findAsset, getTokenLogoUrl, tokenLogos],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }, []);

  const visible = transactions.filter(tx => showHidden || !hideIds.includes(tx.id));

  if (visible.length === 0) {
    return <div className="tx-list-empty">{emptyMessage}</div>;
  }

  return (
    <div className="tx-list">
      {transactions.map(tx => {
        const isHidden = hideIds.includes(tx.id);
        if (isHidden && !showHidden) return null;

        const isExpanded  = expandedIds.has(tx.id);
        const isDeposit   = tx.type === 'deposit';
        const isSwapLegOnly = !!tx.swapLegOnly;
        const isWithdraw  = tx.type === 'withdraw' && !isSwapLegOnly;
        const isSwap      = tx.type === 'swap';
        const { Icon, bg, color, label } = txVisual(isSwapLegOnly ? 'swap' : tx.type);

        const coinAsset = findAsset(tx.asset, tx.chain);
        const counterAsset = tx.counterAsset ? findAsset(tx.counterAsset, tx.chain) : undefined;
        const coinLogo  = getLogoUrl(tx.asset, tx.chain);
        const explorerBase = EXPLORER[tx.chain] ?? 'https://scan.pulsechain.com';
        const fromLabel = displayAddr(tx.from);
        const toLabel = displayAddr(tx.to);

        return (
          <div
            key={tx.id}
            className={`tx-card-row${isHidden ? ' tx-card-row--hidden' : ''}`}
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {/* -- Card row ----------------------------------------------- */}
            <div
              className={`tx-card${compact ? ' tx-card--compact' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => toggleExpand(tx.id)}
            >
              {/* Left */}
              <div className="tx-card__left">
                {!compact && (
                  <div className="tx-card__icon" style={{ background: bg, color }}>
                    <Icon size={13} />
                  </div>
                )}
                <div className="tx-card__meta">
                  {/* Badges row: type pill + chain dot + chain label + date */}
                  <div className="tx-card__badges">
                    <span className="tx-card__type-badge" style={{ background: bg, color }}>{label}</span>
                    <span className="tx-chain-dot" style={{ background: CHAIN_DOT[tx.chain] ?? 'var(--fg-subtle)' }} title={tx.chain} />
                    <span className="tx-chain-label" style={{ color: CHAIN_DOT[tx.chain] ?? 'var(--fg-subtle)' }}>
                      {CHAIN_LABEL[tx.chain] ?? tx.chain.toUpperCase()}
                    </span>
                    <span className="tx-card__date">{format(tx.timestamp, 'MMM d, yyyy')}</span>
                    {tx.libertySwap && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100,
                        background: 'rgba(98,126,234,0.12)', color: '#627EEA',
                        border: '1px solid rgba(98,126,234,0.3)', letterSpacing: '.4px',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <ArrowLeftRight size={8} /> LIBERTY SWAP
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span>{isSwap ? 'from' : isDeposit ? 'from' : 'to'}</span>
                    <strong style={{ color: isOwn(isSwap || isDeposit ? tx.from : tx.to) ? 'var(--accent)' : 'var(--fg-muted)' }}>
                      {isSwap || isDeposit ? fromLabel : toLabel}
                    </strong>
                    {isSwap && (
                      <>
                        <span>to</span>
                        <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg-muted)' }}>{toLabel}</strong>
                      </>
                    )}
                  </div>

                  {/* Amount row */}
                  {(!compact || isSwap || isSwapLegOnly) && (
                  <div
                    className="tx-card__amount"
                    style={{ color: isDeposit ? 'var(--accent)' : (isSwap || isSwapLegOnly) ? 'var(--fg)' : '#ef4444' }}
                  >
                    {isDeposit ? '+' : isWithdraw ? '-' : ''}
                    {isSwap && tx.counterAsset
                      ? (
                        <span className="tx-swap-line">
                          <span className="tx-swap-leg tx-swap-leg--paid">
                            Paid {(tx.counterAmount ?? 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} {tx.counterAsset}
                          </span>
                          <span className="tx-swap-arrow" aria-hidden="true">-&gt;</span>
                          <span className="tx-swap-leg tx-swap-leg--got">
                            Got {tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} {tx.asset}
                          </span>
                        </span>
                      )
                      : isSwapLegOnly
                        ? `Paid ${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}`
                      : `${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}`}
                      {!compact && tx.valueUsd != null && (
                        <span className="tx-card__usd">
                          ~ ${tx.valueUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: actions */}
              <div className="tx-card__actions">
                <div className="tx-card__side-meta">
                  {tx.valueUsd != null && (
                    <span className="tx-card__side-value">
                      ${tx.valueUsd.toLocaleString('en-US', { maximumFractionDigits: compact ? 0 : 2 })}
                    </span>
                  )}
                  <span className="tx-card__side-time">
                    {formatDistanceToNowStrict(tx.timestamp, { addSuffix: true })}
                  </span>
                </div>
                {coinLogo && onFilterByAsset && (
                  <button
                    onClick={e => { e.stopPropagation(); onFilterByAsset(tx.asset); }}
                    title={`Filter by ${tx.asset}`}
                    style={{
                      width: 22, height: 22, minWidth: 22, minHeight: 22,
                      borderRadius: '50%', overflow: 'hidden',
                      border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                      flexShrink: 0, cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <img
                      src={coinLogo}
                      alt={tx.asset}
                      style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </button>
                )}
                {onToggleHide && (
                  <button
                    title={isHidden ? 'Unhide' : 'Hide'}
                    onClick={e => { e.stopPropagation(); onToggleHide(tx.id); }}
                    className="tx-card__hide-btn"
                  >
                    {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
                <span style={{ color: isExpanded ? 'var(--accent)' : 'var(--fg-subtle)', transition: 'color .12s', display: 'flex', alignItems: 'center' }}>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </div>
            </div>

            {/* -- Expanded detail panel ----------------------------------- */}
            {isExpanded && (
              <div className="tx-card__detail-panel" style={{ padding: '0 18px 14px', background: 'var(--bg-inset, var(--bg-elevated))' }}>
                {isSwap
                  ? <SwapDetail tx={tx} coinAsset={coinAsset} counterAsset={counterAsset} coinLogo={coinLogo} getLogoUrl={getLogoUrl} displayAddr={displayAddr} isOwn={isOwn} explorerBase={explorerBase} onFilterByAsset={onFilterByAsset} />
                  : <TransferDetail tx={tx} isDeposit={isDeposit} coinAsset={coinAsset} displayAddr={displayAddr} isOwn={isOwn} explorerBase={explorerBase} />
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -- Swap detail panel ---------------------------------------------------------
interface SwapDetailProps {
  tx: Transaction;
  coinAsset: Asset | undefined;
  counterAsset: Asset | undefined;
  coinLogo: string;
  getLogoUrl: (symbol: string, chain: string) => string;
  displayAddr: (addr: string | undefined) => string;
  isOwn: (addr: string | undefined) => boolean;
  explorerBase: string;
  onFilterByAsset?: (symbol: string) => void;
}

function SwapDetail({ tx, coinAsset, counterAsset, coinLogo, getLogoUrl, displayAddr, isOwn, explorerBase, onFilterByAsset }: SwapDetailProps) {
  const counterLogo = tx.counterAsset ? getLogoUrl(tx.counterAsset, tx.chain) : '';

  // Performance tracking
  const nowPriceReceived = coinAsset?.price ?? 0;
  const nowPriceSpent = counterAsset?.price ?? 0;
  const thenPriceReceived = tx.assetPriceUsdAtTx ?? (tx.valueUsd && tx.amount > 0 ? tx.valueUsd / tx.amount : 0);
  const thenPriceSpent = tx.counterPriceUsdAtTx ?? (tx.valueUsd && tx.counterAmount && tx.counterAmount > 0 ? tx.valueUsd / tx.counterAmount : 0);

  // P&L: dollar value of received tokens at current price vs entry cost
  const dollarPnl = tx.valueUsd != null && nowPriceReceived > 0
    ? (tx.amount * nowPriceReceived) - tx.valueUsd
    : null;

  return (
    <div className="tx-swap-detail" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      {/* Context line */}
      <div className="tx-detail-context" style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>
          Swap from{' '}
          <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.from)}</strong>
          {' '}to{' '}
          <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.to)}</strong>
        </span>
        {tx.fee != null && tx.fee > 0 && (
          <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>
            &#x26FD; {tx.fee.toLocaleString('en-US', { maximumFractionDigits: 4 })} {tx.chain === 'ethereum' ? 'ETH' : 'PLS'}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--fg-subtle)', fontSize: 11 }}>
          {format(tx.timestamp, 'MMM d, yyyy HH:mm')}
        </span>
      </div>

      {/* P&L card */}
      {dollarPnl !== null && (
        <div className="tx-pnl-grid" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div
            className="tx-pnl-card"
            style={{
              background: dollarPnl >= 0 ? 'rgba(0,255,159,0.06)' : 'rgba(244,63,94,0.06)',
              border: `1px solid ${dollarPnl >= 0 ? 'rgba(0,255,159,0.18)' : 'rgba(244,63,94,0.18)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {dollarPnl >= 0
                ? <TrendingUp size={11} style={{ color: 'var(--accent)' }} />
                : <TrendingDown size={11} style={{ color: '#ef4444' }} />}
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Position P/L
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: dollarPnl >= 0 ? 'var(--accent)' : '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>
              {fmtPnl(dollarPnl)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>At current prices</div>
          </div>
        </div>
      )}

      {/* Received leg */}
      <div className="tx-token-leg-kicker" style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.55px', marginBottom: 5 }}>
        Got
      </div>
      <TokenLeg
        logo={coinLogo}
        symbol={tx.asset}
        amount={tx.amount}
        sign="+"
        color="var(--accent)"
        thenPrice={thenPriceReceived}
        nowPrice={nowPriceReceived}
        explorerUrl={`${explorerBase}/tx/${tx.hash}`}
        onFilter={onFilterByAsset ? () => onFilterByAsset(tx.asset) : undefined}
      />

      {/* Spent leg */}
      {tx.counterAsset != null && tx.counterAmount != null && (
        <div style={{ marginTop: 6 }}>
          <div className="tx-token-leg-kicker" style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.55px', marginBottom: 5 }}>
            Paid
          </div>
          <TokenLeg
            logo={counterLogo}
            symbol={tx.counterAsset}
            amount={tx.counterAmount}
            sign="-"
            color="#ef4444"
            thenPrice={thenPriceSpent}
            nowPrice={nowPriceSpent}
            explorerUrl={`${explorerBase}/tx/${tx.hash}`}
            onFilter={onFilterByAsset && tx.counterAsset ? () => onFilterByAsset(tx.counterAsset as string) : undefined}
          />
        </div>
      )}

      {tx.libertySwap && (
        <LibertySwapPanel dstChainId={tx.libertySwap.dstChainId} orderId={tx.libertySwap.orderId} />
      )}
    </div>
  );
}

// -- Token leg (used inside SwapDetail) ----------------------------------------
interface TokenLegProps {
  logo: string;
  symbol: string;
  amount: number;
  sign: string;
  color: string;
  thenPrice: number;
  nowPrice: number;
  explorerUrl: string;
  onFilter?: () => void;
}

function TokenLeg({ logo, symbol, amount, sign, color, thenPrice, nowPrice, explorerUrl, onFilter }: TokenLegProps) {
  return (
    <div className="tx-token-leg" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
      {logo
        ? <img src={logo} alt={symbol} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color, flexShrink: 0 }}>{symbol[0]}</div>
      }
      <div className="tx-token-leg__body" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
          {sign} {amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
        </div>
        {thenPrice > 0 && (
          <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 1 }}>
            Then: <span style={{ color: 'var(--fg-muted)' }}>{fmtPrice(thenPrice)}</span>
            {nowPrice > 0 && (
              <>
                {' '}&middot; Now:{' '}
                <span style={{ color: nowPrice >= thenPrice ? 'var(--accent)' : '#ef4444' }}>{fmtPrice(nowPrice)}</span>
              </>
            )}
          </div>
        )}
      </div>
      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ color: 'var(--fg-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <ExternalLink size={12} />
      </a>
      {onFilter && (
        <button onClick={e => { e.stopPropagation(); onFilter(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Filter size={12} />
        </button>
      )}
    </div>
  );
}

// -- Transfer (deposit / withdraw) detail panel --------------------------------
interface TransferDetailProps {
  tx: Transaction;
  isDeposit: boolean;
  coinAsset: Asset | undefined;
  displayAddr: (addr: string | undefined) => string;
  isOwn: (addr: string | undefined) => boolean;
  explorerBase: string;
}

function TransferDetail({ tx, isDeposit, coinAsset, displayAddr, isOwn, explorerBase }: TransferDetailProps) {
  const currentValue = coinAsset ? tx.amount * coinAsset.price : null;
  const pnl = currentValue != null && tx.valueUsd != null ? currentValue - tx.valueUsd : null;

  const stats: Array<{ label: string; val: string; sub: string; color?: string }> = [
    {
      label: 'Amount',
      val: `${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${tx.asset}`,
      sub: 'Token amount',
    },
    {
      label: 'USD at Entry',
      val: tx.valueUsd != null ? `$${tx.valueUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-',
      sub: 'Value at time of tx',
    },
    {
      label: 'Current Price',
      val: coinAsset?.price ? fmtPrice(coinAsset.price) : '-',
      sub: coinAsset ? `${tx.asset} now` : 'Price unknown',
    },
    {
      label: 'Current Value',
      val: currentValue != null ? `$${currentValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-',
      sub: 'If held to now',
      color: currentValue != null && tx.valueUsd != null
        ? currentValue >= tx.valueUsd ? 'var(--accent)' : '#ef4444'
        : undefined,
    },
    ...(pnl !== null ? [{
      label: 'Profit / Loss',
      val: `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      sub: tx.valueUsd
        ? `${(((currentValue! / tx.valueUsd) - 1) * 100).toFixed(1)}% change`
        : '',
      color: pnl >= 0 ? 'var(--accent)' : '#ef4444',
    }] : []),
    {
      label: 'Chain',
      val: tx.chain === 'pulsechain' ? 'PulseChain' : tx.chain === 'ethereum' ? 'Ethereum' : 'Base',
      sub: isDeposit ? `From ${displayAddr(tx.from)}` : `To ${displayAddr(tx.to)}`,
    },
    {
      label: 'Date',
      val: format(tx.timestamp, 'MMM d, yyyy'),
      sub: format(tx.timestamp, 'HH:mm:ss'),
    },
  ];

  return (
    <div className="tx-transfer-detail" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      {/* Context line */}
      <div className="tx-detail-context" style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>
        {isDeposit
          ? <>Received from <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.from)}</strong></>
          : <>Sent to <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.to)}</strong></>}
        <span style={{ color: 'var(--fg-subtle)', fontSize: 11, marginLeft: 10 }}>
          {format(tx.timestamp, 'MMM d, yyyy HH:mm')}
        </span>
      </div>

      {/* Stats grid */}
      <div className="tx-transfer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {stats.map(({ label, val, sub, color }) => (
          <div key={label} className="tx-transfer-stat" style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: color ?? 'var(--fg)' }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Explorer link */}
      <div style={{ marginTop: 8 }}>
        <a
          href={`${explorerBase}/tx/${tx.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
        >
          <ExternalLink size={11} /> View on Explorer
        </a>
      </div>

      {tx.libertySwap && (
        <LibertySwapPanel dstChainId={tx.libertySwap.dstChainId} orderId={tx.libertySwap.orderId} />
      )}
    </div>
  );
}
