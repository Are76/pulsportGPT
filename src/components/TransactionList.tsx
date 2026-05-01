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

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, RefreshCcw,
  ExternalLink, EyeOff, Eye,
  ChevronDown, ChevronUp,
  Filter, TrendingUp, TrendingDown,
  ArrowLeftRight,
  Workflow,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { Transaction } from '../types';
import type { Asset, Wallet } from '../types';
import {
  buildTransactionAmountDescriptor,
  buildTransactionMetadataDescriptor,
  buildTransactionUsdDescriptor,
} from '../features/provenance/builders';
import { ProvenanceTrigger } from '../features/provenance/ProvenancePopover';

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

/**
 * Determines the best-estimate USD value for a transaction.
 *
 * Attempts sources in priority order: explicit `tx.valueUsd` if > 0, historical asset price at transaction time multiplied by amounts (`assetPriceUsdAtTx * amount` or `counterPriceUsdAtTx * counterAmount`), then current `coinAsset.price * amount`, then `counterAsset.price * counterAmount`. Returns the first usable computed value.
 *
 * @param tx - The transaction to evaluate.
 * @param coinAsset - Optional asset metadata for the transaction's primary asset; used as a fallback with current price when historical data is absent.
 * @param counterAsset - Optional asset metadata for the transaction's counter asset; used as a fallback with current price when historical data is absent.
 * @returns The resolved USD value for the transaction, or `undefined` if no usable data is available.
 */
function resolveTransactionUsdValue(
  tx: Transaction,
  coinAsset?: Asset,
  counterAsset?: Asset,
): number | undefined {
  if ((tx.valueUsd ?? 0) > 0) return tx.valueUsd;

  if ((tx.assetPriceUsdAtTx ?? 0) > 0 && tx.amount > 0) {
    return tx.assetPriceUsdAtTx! * tx.amount;
  }

  if ((tx.counterPriceUsdAtTx ?? 0) > 0 && (tx.counterAmount ?? 0) > 0) {
    return tx.counterPriceUsdAtTx! * (tx.counterAmount ?? 0);
  }

  if ((coinAsset?.price ?? 0) > 0 && tx.amount > 0) {
    return coinAsset!.price * tx.amount;
  }

  if ((counterAsset?.price ?? 0) > 0 && (tx.counterAmount ?? 0) > 0) {
    return counterAsset!.price * (tx.counterAmount ?? 0);
  }

  return undefined;
}

/**
 * Provide visual metadata (icon component, background color, foreground color, and label) for a transaction type.
 *
 * @param type - Transaction type: `deposit`, `withdraw`, `swap`, or `interaction`
 * @returns An object with `Icon` (React icon component), `bg` (CSS background color), `color` (CSS foreground color), and `label` (short display label)
 */
function txVisual(type: Transaction['type']) {
  switch (type) {
    case 'deposit':  return { Icon: ArrowDownLeft, bg: 'rgba(0,255,159,.10)', color: 'var(--accent)',  label: 'Received' } as const;
    case 'withdraw': return { Icon: ArrowUpRight,  bg: 'rgba(239,68,68,.10)',  color: '#ef4444',        label: 'Sent'     } as const;
    case 'swap':     return { Icon: RefreshCcw,    bg: 'rgba(139,92,246,.10)', color: '#8b5cf6',        label: 'Swap'     } as const;
    case 'interaction': return { Icon: Workflow, bg: 'rgba(59,130,246,.10)', color: '#3b82f6', label: 'Call' } as const;
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
  /** Render only the first N rows initially and progressively reveal more. */
  initialVisibleCount?: number;
  /** Number of rows to reveal per click when initialVisibleCount is set. */
  loadMoreCount?: number;
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

/**
 * Renders a compact Liberty Swap Bridge summary panel showing destination chain and shortened order ID.
 *
 * Displays the destination chain name (looked up from known LibertySwap chain names, falling back to `Chain {id}`) and a truncated order ID when longer than 14 characters, plus a link to libertyswap.finance and a short explanatory note.
 *
 * @param dstChainId - Numeric LibertySwap destination chain ID used to derive the displayed chain name.
 * @param orderId - LibertySwap order identifier (displayed truncated if longer than 14 characters).
 * @returns A JSX element containing the Liberty Swap Bridge UI panel.
 */
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

/**
 * Render a configurable list of transaction cards with expandable detail panels and per-asset controls.
 *
 * Renders each transaction as a row that can show a condensed or full amount line, USD/value metadata, optional asset logo filter button, hide/unhide control, and an expandable detail area (SwapDetail, InteractionDetail, or TransferDetail). Supports labeling tracked wallet addresses as "You", resolving asset metadata/logos, estimating entry USD value, marking LibertySwap entries, and progressive "load more" pagination.
 *
 * @param transactions - Array of transactions to display.
 * @param viewAsYou - When true, known wallet addresses are labeled with wallet names or "You" instead of shortened addresses.
 * @param wallets - Tracked wallets used to resolve ownership and display names.
 * @param compact - When true, use a compact row layout that hides some metadata and USD values.
 * @param assets - Asset metadata (price, symbol, chain) used to resolve logos and compute USD estimates.
 * @param getTokenLogoUrl - Optional callback that returns a logo URL for a given Asset.
 * @param tokenLogos - Fallback map of token symbol → logo URL used when `getTokenLogoUrl` or asset lookup is unavailable.
 * @param hideIds - Transaction IDs that should be rendered in a hidden state.
 * @param onToggleHide - Optional callback invoked with a transaction ID to toggle its hidden state.
 * @param showHidden - When true, include transactions whose IDs appear in `hideIds` in the visible list.
 * @param onFilterByAsset - Optional callback invoked with a token symbol when the user requests filtering by that asset.
 * @param emptyMessage - Message to display when there are no visible transactions.
 * @param initialVisibleCount - Optional initial number of transactions to show; when omitted all visible transactions are shown.
 * @param loadMoreCount - Number of additional transactions to reveal when the "Load more" control is clicked.
 * @returns The React element tree for the transaction list.
 */
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
  initialVisibleCount,
  loadMoreCount = 100,
}: TransactionListProps) {
  // Internal expansion state - no parent needed
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState<number>(initialVisibleCount ?? Number.POSITIVE_INFINITY);

  const walletMap = useMemo(
    () => new Map(wallets.map(w => [w.address.toLowerCase(), w])),
    [wallets],
  );
  const walletSet = useMemo(() => new Set(walletMap.keys()), [walletMap]);

  const assetMap = useMemo(() => {
    const next = new Map<string, Asset>();
    for (const asset of assets) {
      next.set(`${asset.chain}:${normalizeSymbol(asset.symbol, asset.chain)}`, asset);
    }
    return next;
  }, [assets]);

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
        const w = walletMap.get(lower);
        return w?.name || 'You';
      }
      return shortAddr(addr);
    },
    [viewAsYou, walletMap, walletSet],
  );

  const findAsset = useCallback(
    (symbol: string, chain: string): Asset | undefined =>
      assetMap.get(`${chain}:${normalizeSymbol(symbol, chain)}`),
    [assetMap],
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
  const paginatedTransactions = useMemo(() => {
    return Number.isFinite(visibleCount)
      ? visible.slice(0, visibleCount)
      : visible;
  }, [visible, visibleCount]);

  useEffect(() => {
    setVisibleCount(initialVisibleCount ?? Number.POSITIVE_INFINITY);
  }, [initialVisibleCount, transactions, showHidden]);

  if (visible.length === 0) {
    return <div className="tx-list-empty">{emptyMessage}</div>;
  }

  return (
    <div className="tx-list">
      {paginatedTransactions.map(tx => {
        const isHidden = hideIds.includes(tx.id);
        const isExpanded  = expandedIds.has(tx.id);
        const isDeposit   = tx.type === 'deposit';
        const isSwapLegOnly = !!tx.swapLegOnly;
        const isWithdraw  = tx.type === 'withdraw' && !isSwapLegOnly;
        const isSwap      = tx.type === 'swap';
        const isInteraction = tx.type === 'interaction';
        const { Icon, bg, color, label } = txVisual(isSwapLegOnly ? 'swap' : tx.type);

        const coinAsset = findAsset(tx.asset, tx.chain);
        const counterAsset = tx.counterAsset ? findAsset(tx.counterAsset, tx.chain) : undefined;
        const resolvedUsdValue = resolveTransactionUsdValue(tx, coinAsset, counterAsset);
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
                    {isSwap || isSwapLegOnly ? (
                      <>
                        <strong style={{ color: 'var(--fg)' }}>Swap</strong>
                        <span>from</span>
                        <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg-muted)' }}>{fromLabel}</strong>
                        <span>to</span>
                        <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg-muted)' }}>{toLabel}</strong>
                      </>
                    ) : isInteraction ? (
                      <>
                        <span>contract call from</span>
                        <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg-muted)' }}>{fromLabel}</strong>
                        <span>to</span>
                        <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg-muted)' }}>{toLabel}</strong>
                      </>
                    ) : isDeposit ? (
                      <>
                        <span>from</span>
                        <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg-muted)' }}>{fromLabel}</strong>
                      </>
                    ) : (
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
                    style={{ color: isDeposit ? 'var(--accent)' : (isSwap || isSwapLegOnly) ? 'var(--fg)' : isInteraction ? '#3b82f6' : '#ef4444' }}
                  >
                    <ProvenanceTrigger
                      descriptor={buildTransactionAmountDescriptor(tx, {
                        onDrilldown: onFilterByAsset ? () => onFilterByAsset(tx.asset) : undefined,
                      })}
                    >
                      <>
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
                          : isInteraction
                            ? `Contract call to ${shortAddr(tx.to)}`
                          : isSwapLegOnly
                            ? `Paid ${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}`
                            : `${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}`}
                      </>
                    </ProvenanceTrigger>
                    {!compact && resolvedUsdValue != null && (
                      <span className="tx-card__usd">
                        <ProvenanceTrigger descriptor={buildTransactionUsdDescriptor(tx, resolvedUsdValue, coinAsset?.price)}>
                          ~ ${resolvedUsdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </ProvenanceTrigger>
                      </span>
                    )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: actions */}
              <div className="tx-card__actions">
                <div className="tx-card__side-meta">
                  {resolvedUsdValue != null && (
                    <span className="tx-card__side-value">
                      <ProvenanceTrigger descriptor={buildTransactionUsdDescriptor(tx, resolvedUsdValue, coinAsset?.price)}>
                        ${resolvedUsdValue.toLocaleString('en-US', { maximumFractionDigits: compact ? 0 : 2 })}
                      </ProvenanceTrigger>
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
                    aria-label={`Filter transactions by ${tx.asset}`}
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
                    aria-label={isHidden ? `Unhide transaction ${tx.hash}` : `Hide transaction ${tx.hash}`}
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
                {isSwap || isSwapLegOnly
                  ? <SwapDetail tx={tx} coinAsset={coinAsset} counterAsset={counterAsset} coinLogo={coinLogo} getLogoUrl={getLogoUrl} displayAddr={displayAddr} isOwn={isOwn} explorerBase={explorerBase} onFilterByAsset={onFilterByAsset} resolvedUsdValue={resolvedUsdValue} />
                  : isInteraction
                    ? <InteractionDetail tx={tx} displayAddr={displayAddr} isOwn={isOwn} explorerBase={explorerBase} />
                  : <TransferDetail tx={tx} isDeposit={isDeposit} coinAsset={coinAsset} displayAddr={displayAddr} isOwn={isOwn} explorerBase={explorerBase} resolvedUsdValue={resolvedUsdValue} />
                }
              </div>
            )}
          </div>
        );
      })}
      {paginatedTransactions.length < visible.length && (
        <div
          className="tx-list-load-more"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 18px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
            Showing {paginatedTransactions.length.toLocaleString('en-US')} of {visible.length.toLocaleString('en-US')} transactions
          </span>
          <button
            type="button"
            onClick={() => setVisibleCount((current) => {
              if (!Number.isFinite(current)) return current;
              return Math.min(current + loadMoreCount, visible.length);
            })}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--fg)',
              borderRadius: 999,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Load {Math.min(loadMoreCount, visible.length - paginatedTransactions.length).toLocaleString('en-US')} more
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Render detailed information for a contract interaction transaction.
 *
 * Renders a contextual line describing the call sender and recipient, a grid of stat cards
 * (Type, Chain, From, To, Date) and an external explorer link for the transaction hash.
 *
 * @param tx - The transaction to describe (interaction/call)
 * @param displayAddr - Function that returns a display-friendly string for an address or undefined
 * @param isOwn - Predicate that returns `true` when the given address belongs to a tracked wallet
 * @param explorerBase - Base URL for the chain explorer used to build the transaction link
 * @returns A JSX element containing the interaction detail panel with stats and an explorer link
 */
function InteractionDetail({
  tx,
  displayAddr,
  isOwn,
  explorerBase,
}: {
  tx: Transaction;
  displayAddr: (addr: string | undefined) => string;
  isOwn: (addr: string | undefined) => boolean;
  explorerBase: string;
}) {
  const stats = [
    { label: 'Type', val: 'Contract interaction', sub: 'Zero-value on-chain call preserved from the raw ledger.' },
    { label: 'Chain', val: tx.chain === 'pulsechain' ? 'PulseChain' : tx.chain === 'ethereum' ? 'Ethereum' : 'Base', sub: `Hash ${shortAddr(tx.hash)}` },
    { label: 'From', val: displayAddr(tx.from), sub: isOwn(tx.from) ? 'Tracked wallet' : 'External sender' },
    { label: 'To', val: displayAddr(tx.to), sub: isOwn(tx.to) ? 'Tracked wallet' : 'Contract or destination' },
    { label: 'Date', val: format(tx.timestamp, 'MMM d, yyyy'), sub: format(tx.timestamp, 'HH:mm:ss') },
  ];

  return (
    <div className="tx-transfer-detail" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div className="tx-detail-context" style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>
        Contract call from <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.from)}</strong>
        <span> to </span>
        <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.to)}</strong>
      </div>
      <div className="tx-transfer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {stats.map(({ label, val, sub }) => (
          <div key={label} className="tx-transfer-stat" style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>
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
  resolvedUsdValue?: number;
}

function SwapDetail({ tx, coinAsset, counterAsset, coinLogo, getLogoUrl, displayAddr, isOwn, explorerBase, onFilterByAsset, resolvedUsdValue }: SwapDetailProps) {
  const counterLogo = tx.counterAsset ? getLogoUrl(tx.counterAsset, tx.chain) : '';
  const isPartialSwap = !!tx.swapLegOnly || !tx.counterAsset;

  // Performance tracking
  const nowPriceReceived = coinAsset?.price ?? 0;
  const nowPriceSpent = counterAsset?.price ?? 0;
  const thenPriceReceived = tx.assetPriceUsdAtTx ?? (resolvedUsdValue && tx.amount > 0 ? resolvedUsdValue / tx.amount : 0);
  const thenPriceSpent = tx.counterPriceUsdAtTx ?? (resolvedUsdValue && tx.counterAmount && tx.counterAmount > 0 ? resolvedUsdValue / tx.counterAmount : 0);

  // P&L: dollar value of received tokens at current price vs entry cost
  const dollarPnl = resolvedUsdValue != null && nowPriceReceived > 0
    ? (tx.amount * nowPriceReceived) - resolvedUsdValue
    : null;
  const tradePnl = dollarPnl != null && nowPriceReceived > 0
    ? dollarPnl / nowPriceReceived
    : null;
  const gasSymbol = tx.chain === 'ethereum' ? 'ETH' : tx.chain === 'base' ? 'ETH' : 'PLS';
  const gasUsd = tx.fee != null
    ? `${tx.fee.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${gasSymbol}`
    : null;

  return (
    <div className="tx-swap-detail">
      <div className="tx-swap-shell">
        <div className="tx-swap-shell__top">
          <div className="tx-swap-shell__route">
            <strong>Swap</strong>
            <span>from</span>
            <strong style={{ color: isOwn(tx.from) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.from)}</strong>
            <span>to</span>
            <strong style={{ color: isOwn(tx.to) ? 'var(--accent)' : 'var(--fg)' }}>{displayAddr(tx.to)}</strong>
          </div>
          <div className="tx-swap-shell__meta">
            {gasUsd && <span>{gasUsd}</span>}
            <span>{formatDistanceToNowStrict(tx.timestamp, { addSuffix: true })}</span>
          </div>
        </div>

        {(tradePnl !== null || dollarPnl !== null) && (
          <div className="tx-swap-pnl-strip">
            <div className={`tx-swap-pnl-chip${tradePnl != null && tradePnl >= 0 ? ' is-up' : ' is-down'}`}>
              <span>Trade P/L</span>
              <strong>
                {tradePnl != null
                  ? `${tradePnl >= 0 ? '+' : '-'}${Math.abs(tradePnl).toLocaleString('en-US', { maximumFractionDigits: 6 })}`
                  : '-'}
              </strong>
            </div>
            <div className={`tx-swap-pnl-chip${dollarPnl != null && dollarPnl >= 0 ? ' is-up' : ' is-down'}`}>
              <span>Dollar P/L</span>
              <strong>{dollarPnl != null ? fmtPnl(dollarPnl) : '-'}</strong>
            </div>
          </div>
        )}

        {isPartialSwap ? (
          <>
            <div className="tx-token-leg-kicker">
              Paid
            </div>
            <TokenLeg
              logo={coinLogo}
              symbol={tx.asset}
              amount={tx.amount}
              sign="-"
              color="#ef4444"
              thenPrice={thenPriceReceived}
              nowPrice={nowPriceReceived}
              explorerUrl={`${explorerBase}/tx/${tx.hash}`}
              onFilter={onFilterByAsset ? () => onFilterByAsset(tx.asset) : undefined}
            />
            <div className="tx-swap-note">
              Counterparty token was not returned by the explorer for this hash.
            </div>
          </>
        ) : (
          <>
            <div className="tx-token-leg-kicker">
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
          </>
        )}

        {!isPartialSwap && tx.counterAsset != null && tx.counterAmount != null && (
          <div className="tx-swap-leg-section">
            <div className="tx-token-leg-kicker">
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
    <div className="tx-token-leg">
      {logo
        ? <img src={logo} alt={symbol} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color, flexShrink: 0 }}>{symbol[0]}</div>
      }
      <div className="tx-token-leg__body">
        <div className="tx-token-leg__amount" style={{ color }}>
          {sign} {amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol}
        </div>
        {thenPrice > 0 && (
          <div className="tx-token-leg__pricing">
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
  resolvedUsdValue?: number;
}

function TransferDetail({ tx, isDeposit, coinAsset, displayAddr, isOwn, explorerBase, resolvedUsdValue }: TransferDetailProps) {
  const currentValue = coinAsset ? tx.amount * coinAsset.price : null;
  const pnl = currentValue != null && resolvedUsdValue != null ? currentValue - resolvedUsdValue : null;
  const bridgeSummary = tx.bridge ? `${tx.bridge.originChain.charAt(0).toUpperCase()}${tx.bridge.originChain.slice(1)} via ${tx.bridge.protocol}` : null;
  const stakingSummary = tx.staking ? `${tx.staking.protocol.toUpperCase()} ${tx.staking.action}` : null;

  const stats: Array<{ label: string; val: string; sub: string; color?: string; descriptor?: ReturnType<typeof buildTransactionAmountDescriptor> }> = [
    {
      label: 'Amount',
      val: `${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${tx.asset}`,
      sub: 'Token amount',
      descriptor: buildTransactionAmountDescriptor(tx),
    },
    {
      label: 'USD at Entry',
      val: resolvedUsdValue != null ? `$${resolvedUsdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-',
      sub: 'Value at time of tx',
      descriptor: resolvedUsdValue != null ? buildTransactionUsdDescriptor(tx, resolvedUsdValue, coinAsset?.price) : undefined,
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
      color: currentValue != null && resolvedUsdValue != null
        ? currentValue >= resolvedUsdValue ? 'var(--accent)' : '#ef4444'
        : undefined,
    },
    ...(pnl !== null ? [{
      label: 'Profit / Loss',
      val: `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      sub: resolvedUsdValue
        ? `${(((currentValue! / resolvedUsdValue) - 1) * 100).toFixed(1)}% change`
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
    ...(bridgeSummary ? [{
      label: 'Bridge',
      val: bridgeSummary,
      sub: tx.bridged ? 'Cross-chain transfer detected' : 'Bridge metadata',
      descriptor: buildTransactionMetadataDescriptor('Bridge metadata', bridgeSummary, tx, 'Bridge metadata normalized from the selected transaction'),
    }] : []),
    ...(stakingSummary ? [{
      label: 'Staking',
      val: stakingSummary,
      sub: 'Detected from on-chain call metadata',
      descriptor: buildTransactionMetadataDescriptor('Staking metadata', stakingSummary, tx, 'Staking metadata normalized from the selected transaction'),
    }] : []),
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
        {stats.map(({ label, val, sub, color, descriptor }) => (
          <div key={label} className="tx-transfer-stat" style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: color ?? 'var(--fg)' }}>
              {descriptor ? <ProvenanceTrigger descriptor={descriptor}>{val}</ProvenanceTrigger> : val}
            </div>
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
