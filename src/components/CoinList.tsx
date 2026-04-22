import React from 'react';
import { Calculator, ChevronDown, ChevronUp, Copy, ExternalLink, MinusCircle, PlusCircle } from 'lucide-react';

export interface CoinListItem {
  id: string;
  name: string;
  symbol: string;
  chain: string;
  logoUrl?: string;
  priceUsd: number;
  pricePls?: number;
  change24h?: number;
  balance: number;
  valueUsd: number;
  valuePls?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  pools?: number | null;
  costBasisUsd?: number;
  pnlUsd?: number;
  pnlPercent?: number;
  contractAddress?: string;
  meta?: string;
  tags?: string[];
}

type SortField = 'priceUsd' | 'change24h' | 'valueUsd';

interface CoinListProps {
  items: CoinListItem[];
  variant?: 'compact' | 'detailed';
  emptyMessage?: string;
  expandedId?: string | null;
  onToggleExpanded?: (id: string) => void;
  onRowClick?: (item: CoinListItem) => void;
  renderExpanded?: (item: CoinListItem) => React.ReactNode;
  onCopyContract?: (item: CoinListItem) => void;
  onOpenExternal?: (item: CoinListItem) => void;
  onCalculator?: (item: CoinListItem) => void;
  onAdd?: (item: CoinListItem) => void;
  onRemove?: (item: CoinListItem) => void;
}

const formatPrice = (value: number) => {
  if (!value) return '$0.00';
  if (value < 0.00001) return `$${value.toFixed(10)}`;
  if (value < 0.001) return `$${value.toFixed(8)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const formatUsd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const formatCompactUsd = (value?: number) => {
  if (!value) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};
const formatAmount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: value >= 1000 ? 0 : 4 });
const formatPercent = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const chainAccent = (chain: string) => chain === 'pulsechain' ? '#f739ff' : chain === 'ethereum' ? '#627EEA' : '#0052ff';
const FALLBACK_LOGOS: Record<string, string> = {
  PLS: 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
  WPLS: 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
  PLSX: 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png',
  INC: 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png',
  HEX: 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
  EHEX: 'https://cdn.dexscreener.com/cms/images/a46bd12940d8501c2aacdd10ad4780e818bdedaba1ec8eb46b52e4d8313d4a93?width=64&height=64&fit=crop&quality=95&format=auto',
  PRVX: 'https://cdn.dexscreener.com/cms/images/ODHYYN7yppDHnd6u?width=64&height=64&fit=crop&quality=95&format=auto',
  MOST: 'https://tokens.app.pulsex.com/images/tokens/0xE33A5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC.png',
  PDAI: 'https://tokens.app.pulsex.com/images/tokens/0x6B175474E89094C44Da98b954EedeAC495271d0F.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
};

function CoinListLogo({ logoUrl, symbol }: { logoUrl?: string; symbol: string }) {
  const [broken, setBroken] = React.useState(false);
  const resolvedLogo = logoUrl || FALLBACK_LOGOS[symbol.toUpperCase()];

  return (
    <span className="coin-list-logo">
      {resolvedLogo && !broken ? (
        <img src={resolvedLogo} alt={symbol} onError={() => setBroken(true)} />
      ) : (
        symbol.slice(0, 1)
      )}
    </span>
  );
}

function formatChainLabel(chain: string) {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function CoinList({
  items,
  variant = 'detailed',
  emptyMessage = 'No assets found.',
  expandedId = null,
  onToggleExpanded,
  onRowClick,
  renderExpanded,
  onCopyContract,
  onOpenExternal,
  onCalculator,
  onAdd,
  onRemove,
}: CoinListProps) {
  const [sortField, setSortField] = React.useState<SortField>('valueUsd');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

  const sorted = React.useMemo(() => {
    return [...items].sort((a, b) => {
      const aValue = a[sortField] ?? 0;
      const bValue = b[sortField] ?? 0;
      return sortDir === 'desc' ? Number(bValue) - Number(aValue) : Number(aValue) - Number(bValue);
    });
  }, [items, sortDir, sortField]);

  const toggleSort = (field: SortField) => {
    setSortField(current => {
      if (current === field) {
        setSortDir(dir => dir === 'desc' ? 'asc' : 'desc');
        return current;
      }
      setSortDir('desc');
      return field;
    });
  };

  if (sorted.length === 0) {
    return <div className="coin-list-empty">{emptyMessage}</div>;
  }

  return (
    <div className={`coin-list coin-list--${variant}`}>
      {variant === 'detailed' ? (
        <div className="coin-list-head">
          <button type="button" className="coin-list-head-cell coin-list-head-cell--asset">Token</button>
          <button type="button" className="coin-list-head-cell" onClick={() => toggleSort('priceUsd')}>Price</button>
          <button type="button" className="coin-list-head-cell" onClick={() => toggleSort('change24h')}>24H</button>
          <button type="button" className="coin-list-head-cell">Amount</button>
          <button type="button" className="coin-list-head-cell" onClick={() => toggleSort('valueUsd')}>USD Value</button>
          <span className="coin-list-head-cell coin-list-head-cell--actions" />
        </div>
      ) : null}
      <div className="coin-list-body">
        {sorted.map((item) => {
          const isExpanded = expandedId === item.id;
          const pnlTone = (item.pnlUsd ?? 0) >= 0 ? 'is-up' : 'is-down';
          const dayTone = (item.change24h ?? 0) >= 0 ? 'is-up' : 'is-down';
          const canExpand = Boolean(renderExpanded && onToggleExpanded);
          return (
            <div key={item.id} className={`coin-list-row${isExpanded ? ' is-expanded' : ''}`}>
              <div
                className="coin-list-row-main"
                role="button"
                tabIndex={0}
                onClick={() => canExpand ? onToggleExpanded(item.id) : onRowClick?.(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (canExpand) onToggleExpanded(item.id);
                    else onRowClick?.(item);
                  }
                }}
                >
                  <div className="coin-list-cell coin-list-cell--asset">
                    <CoinListLogo logoUrl={item.logoUrl} symbol={item.symbol} />
                    <div className="coin-list-copy">
                    <button type="button" className="coin-list-name" onClick={(event) => { event.stopPropagation(); onRowClick?.(item); }}>
                      {item.name}
                    </button>
                    <div className="coin-list-subline">
                      <span className="coin-list-chain-dot" style={{ background: chainAccent(item.chain) }} />
                      <span>{item.symbol.toLowerCase()} · {formatChainLabel(item.chain)}</span>
                      {item.meta ? <span className="coin-list-meta">{item.meta}</span> : null}
                      {item.tags?.map((tag) => <span className="coin-list-tag" key={`${item.id}-${tag}`}>{tag}</span>)}
                    </div>
                    {variant === 'detailed' ? (
                      <div className="coin-list-detailline">
                        {item.pricePls != null ? <span>{item.symbol}: {item.pricePls.toFixed(item.pricePls >= 1 ? 2 : 4)} PLS</span> : null}
                        {item.liquidityUsd != null ? <span>Liq {formatCompactUsd(item.liquidityUsd)}</span> : null}
                        {item.volume24hUsd != null ? <span>Vol {formatCompactUsd(item.volume24hUsd)}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="coin-list-cell">
                  <strong className="coin-list-value">{formatPrice(item.priceUsd)}</strong>
                  {variant === 'detailed' && item.pricePls != null ? (
                    <small className="coin-list-subvalue coin-list-subvalue--accent">{item.pricePls.toFixed(item.pricePls >= 1 ? 2 : 4)} PLS</small>
                  ) : null}
                </div>

                {variant === 'detailed' ? (
                  <>
                    <div className={`coin-list-cell ${dayTone}`}>
                      <strong className="coin-list-value">{formatPercent(item.change24h)}</strong>
                    </div>
                    <div className="coin-list-cell">
                      <strong className="coin-list-value">{formatAmount(item.balance)}</strong>
                      <small className="coin-list-subvalue">{item.symbol}</small>
                    </div>
                    <div className="coin-list-cell">
                      <strong className="coin-list-value">{formatUsd(item.valueUsd)}</strong>
                      {item.valuePls != null ? <small className="coin-list-subvalue coin-list-subvalue--accent">{formatAmount(item.valuePls)} PLS</small> : null}
                    </div>
                    <div className="coin-list-cell coin-list-cell--actions">
                      {item.contractAddress ? (
                        <button type="button" className="coin-list-icon" title="Copy contract" onClick={(event) => {
                          event.stopPropagation();
                          if (onCopyContract) onCopyContract(item);
                          else navigator.clipboard.writeText(item.contractAddress!);
                        }}>
                          <Copy size={12} />
                        </button>
                      ) : null}
                      <button type="button" className="coin-list-icon" title="Open detail" onClick={(event) => { event.stopPropagation(); onOpenExternal ? onOpenExternal(item) : onRowClick?.(item); }}>
                        <ExternalLink size={12} />
                      </button>
                      {onCalculator ? (
                        <button type="button" className="coin-list-icon" title="Calculator" onClick={(event) => { event.stopPropagation(); onCalculator(item); }}>
                          <Calculator size={12} />
                        </button>
                      ) : null}
                      {onAdd ? (
                        <button type="button" className="coin-list-icon" title="Add" onClick={(event) => { event.stopPropagation(); onAdd(item); }}>
                          <PlusCircle size={12} />
                        </button>
                      ) : null}
                      {onRemove ? (
                        <button type="button" className="coin-list-icon" title="Remove" onClick={(event) => { event.stopPropagation(); onRemove(item); }}>
                          <MinusCircle size={12} />
                        </button>
                      ) : null}
                      {item.pnlUsd != null ? (
                        <span className={`coin-list-pnl-chip ${pnlTone}`}>
                          {item.pnlUsd >= 0 ? '+' : '-'}{formatCompactUsd(Math.abs(item.pnlUsd))}
                        </span>
                      ) : null}
                      {canExpand ? <span className="coin-list-caret">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span> : null}
                    </div>
                  </>
                ) : (
                  <div className="coin-list-cell coin-list-cell--compact-right">
                    <strong className="coin-list-value">{formatUsd(item.valueUsd)}</strong>
                    <small className="coin-list-subvalue">{formatAmount(item.balance)} · <span className={dayTone}>{formatPercent(item.change24h)}</span></small>
                  </div>
                )}
              </div>
              {isExpanded && renderExpanded ? <div className="coin-list-expanded">{renderExpanded(item)}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
