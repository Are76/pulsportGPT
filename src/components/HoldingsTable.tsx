import React from 'react';
import { Calculator, ChevronDown, ChevronUp, Copy, ExternalLink, Trash2, X } from 'lucide-react';
import type { Asset, Transaction, Wallet } from '../types';
import { TransactionList } from './TransactionList';

export type HoldingSortField = 'value' | 'change';
export type HoldingSortDir = 'asc' | 'desc';

export interface HoldingDisplayAsset extends Asset {
  priceUsd: number;
  pricePls: number;
  valueUsd: number;
  valuePls: number;
  leagueLabel: string;
  leagueRank?: number | null;
  leagueSource?: string | null;
}

interface HoldingsTableProps {
  assets: HoldingDisplayAsset[];
  allAssets: Asset[];
  wallets: Wallet[];
  totalValueUsd: number;
  plsUsdPrice: number;
  priceChangePeriod: '1h' | '6h' | '24h' | '7d';
  sortField: HoldingSortField;
  sortDir: HoldingSortDir;
  expandedIds: Set<string>;
  tokenLogos: Record<string, string>;
  emptyMessage: string;
  currentTransactions: Transaction[];
  manualEntries: Record<string, number>;
  chainColors: Record<string, string>;
  tokenMarketData?: Record<string, any>;
  staticLogos: Record<string, string>;
  getTokenLogoUrl: (asset: Asset) => string;
  explorerUrl: (chain: string, address: string) => string | null;
  dexScreenerUrl: (chain: string, address: string) => string | null;
  onSort: (field: HoldingSortField) => void;
  onToggleExpanded: (id: string) => void;
  onOpenPnl: (asset: Asset) => void;
  onHide?: (id: string) => void;
  onSetEntry: (id: string, value: number) => void;
  onClearEntry: (id: string) => void;
  onFilterByAsset?: (symbol: string) => void;
  showActions?: boolean;
  showSkeleton?: boolean;
  skeletonRows?: number;
  footerLabel?: string;
  footerValueUsd?: number;
  shareBaseUsd?: number;
}

const fmtAmount = (value: number, maxDigits = 4) =>
  value.toLocaleString('en-US', { maximumFractionDigits: maxDigits });

const fmtCompact = (value: number, suffix = '') => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B${suffix}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M${suffix}`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K${suffix}`;
  if (abs >= 1) return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
  return `${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 6 })}${suffix}`;
};

const fmtUsd = (value: number, maxDigits = 2) =>
  `$${value.toLocaleString('en-US', { maximumFractionDigits: maxDigits })}`;

const fmtPrice = (price: number) => {
  if (!price) return '$0.00';
  if (price < 0.0001) return `$${price.toFixed(10).replace(/0+$/, '')}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: price < 1 ? 6 : 2 })}`;
};

const pctForPeriod = (asset: HoldingDisplayAsset, period: HoldingsTableProps['priceChangePeriod']) => {
  if (period === '1h') return asset.priceChange1h ?? 0;
  if (period === '7d') return asset.priceChange7d ?? 0;
  if (period === '6h') return 0;
  return asset.priceChange24h ?? asset.pnl24h ?? 0;
};

export function HoldingsTable({
  assets,
  allAssets,
  wallets,
  totalValueUsd,
  plsUsdPrice,
  priceChangePeriod,
  sortField,
  sortDir,
  expandedIds,
  tokenLogos,
  emptyMessage,
  currentTransactions,
  manualEntries,
  chainColors,
  tokenMarketData = {},
  staticLogos,
  getTokenLogoUrl,
  explorerUrl,
  dexScreenerUrl,
  onSort,
  onToggleExpanded,
  onOpenPnl,
  onHide,
  onSetEntry,
  onClearEntry,
  onFilterByAsset,
  showActions = true,
  showSkeleton = false,
  skeletonRows = 5,
  footerLabel = 'TOTAL LIQUID',
  footerValueUsd,
  shareBaseUsd,
}: HoldingsTableProps) {
  const sortedAssets = React.useMemo(() => {
    return [...assets].sort((a, b) => {
      const aVal = sortField === 'change' ? pctForPeriod(a, priceChangePeriod) : a.valueUsd;
      const bVal = sortField === 'change' ? pctForPeriod(b, priceChangePeriod) : b.valueUsd;
      const diff = bVal - aVal;
      return sortDir === 'desc' ? diff : -diff;
    });
  }, [assets, priceChangePeriod, sortDir, sortField]);

  const tableTotalUsd = footerValueUsd ?? assets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const tableTotalPls = plsUsdPrice > 0 ? tableTotalUsd / plsUsdPrice : 0;
  const portfolioBase = shareBaseUsd ?? totalValueUsd;

  const columns = [
    { label: 'Token', field: null, align: 'left' },
    { label: 'Price', field: null, align: 'right' },
    { label: priceChangePeriod.toUpperCase(), field: 'change' as const, align: 'right' },
    { label: 'Amount', field: null, align: 'right' },
    { label: 'USD Value', field: 'value' as const, align: 'right' },
    { label: 'PLS Value', field: null, align: 'right' },
    { label: 'League', field: null, align: 'right' },
    { label: '% Portfolio', field: null, align: 'right' },
    { label: '', field: null, align: 'right' },
  ];

  return (
    <div className="data-table-scroll">
      <table className="data-table holdings-unified-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map(({ label, field, align }, i) => (
              <th
                key={`${label}-${i}`}
                onClick={field ? () => onSort(field) : undefined}
                style={{
                  padding: '11px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: sortField === field ? 'var(--accent)' : 'var(--fg-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '.5px',
                  textAlign: align as any,
                  whiteSpace: 'nowrap',
                  background: 'var(--bg-surface)',
                  cursor: field ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
              >
                {label}{field && sortField === field ? (sortDir === 'desc' ? ' v' : ' ^') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showSkeleton && assets.length === 0 && Array.from({ length: skeletonRows }, (_, i) => (
            <tr key={`holding-skel-${i}`}>
              <td style={{ padding: '13px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="skeleton" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
                  <div>
                    <div className="skeleton" style={{ width: 80, height: 13, marginBottom: 5 }} />
                    <div className="skeleton" style={{ width: 110, height: 11 }} />
                  </div>
                </div>
              </td>
              {Array.from({ length: 8 }, (_, j) => (
                <td key={j} style={{ padding: '13px 16px', textAlign: 'right' }}>
                  <div className="skeleton" style={{ height: 13, width: 60, marginLeft: 'auto' }} />
                </td>
              ))}
            </tr>
          ))}
          {sortedAssets.length === 0 && !showSkeleton ? (
            <tr>
              <td colSpan={9} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 13 }}>
                {emptyMessage}
              </td>
            </tr>
          ) : sortedAssets.map((asset) => {
            const addr = (asset as any).address;
            const addrLower = addr?.toLowerCase?.() ?? '';
            const logo = staticLogos[addrLower] || asset.logoUrl || tokenLogos[addrLower] || getTokenLogoUrl(asset);
            const explUrl = explorerUrl(asset.chain, addr);
            const dsUrl = dexScreenerUrl(asset.chain, addr);
            const isExpanded = expandedIds.has(asset.id);
            const pct = pctForPeriod(asset, priceChangePeriod);
            const share = ((asset.valueUsd / (portfolioBase || 1)) * 100);
            const entryPls = manualEntries[asset.id];
            const pnlPls = entryPls ? asset.valuePls - entryPls : null;
            const tokenTxs = currentTransactions.filter(tx =>
              tx.chain === asset.chain &&
              (tx.asset.toUpperCase() === asset.symbol.toUpperCase() ||
                (tx.counterAsset ?? '').toUpperCase() === asset.symbol.toUpperCase())
            );
            const previewTxs = tokenTxs.slice(0, 8);
            const md = tokenMarketData[asset.id];

            return (
              <React.Fragment key={asset.id}>
                <tr
                  className={`holding-row${isExpanded ? ' is-expanded' : ''}`}
                  style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', borderLeft: `3px solid ${chainColors[asset.chain] || '#333'}`, cursor: 'pointer' }}
                  onClick={() => onToggleExpanded(asset.id)}
                >
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--fg)', flexShrink: 0, overflow: 'hidden' }}>
                        {logo ? <img src={logo} alt={asset.symbol} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : asset.symbol[0]}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {explUrl ? (
                            <a href={explUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', textDecoration: 'none' }}>
                              {asset.name || asset.symbol}
                            </a>
                          ) : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{asset.name || asset.symbol}</span>
                          )}
                          {addr && addr !== 'native' && (
                            <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(addr); }} title={`Copy contract address: ${addr}`} style={{ padding: '1px 3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', lineHeight: 1 }}>
                              <Copy size={10} />
                            </button>
                          )}
                          {dsUrl && addr !== 'native' && (
                            <a href={dsUrl} target="_blank" rel="noopener noreferrer" title="View on DexScreener" onClick={e => e.stopPropagation()} style={{ padding: '1px 3px', color: 'var(--fg-subtle)', lineHeight: 1, display: 'inline-flex' }}>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: chainColors[asset.chain] || '#555', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--fg-muted)', textTransform: 'lowercase' }}>{asset.symbol} / {asset.chain}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtPrice(asset.priceUsd)}</div>
                    <div style={{ fontSize: 12, color: '#f739ff', marginTop: 2 }}>{fmtCompact(asset.pricePls)} PLS</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: pct >= 0 ? 'var(--accent)' : '#ef4444' }}>
                    {pct >= 0 ? '+' : '-'} {Math.abs(pct).toFixed(2)}%
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{fmtAmount(asset.balance)}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{asset.symbol}</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 800, color: 'var(--fg)' }}>
                    {fmtUsd(asset.valueUsd)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f739ff' }}>{fmtCompact(asset.valuePls)}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>PLS</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {asset.leagueLabel !== '-' ? (
                      <span title={asset.leagueSource || 'OpenPulseChain league'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '3px 7px', fontSize: 11, fontWeight: 800 }}>
                        {asset.leagueRank ? `#${asset.leagueRank}` : asset.leagueLabel}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--fg-subtle)' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 90 }}>
                    <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 3 }}>{share.toFixed(1)}%</div>
                    <div style={{ height: 2, background: 'var(--border)', borderRadius: 1 }}>
                      <div style={{ height: '100%', width: `${Math.min(share, 100)}%`, background: 'var(--accent)', borderRadius: 1 }} />
                    </div>
                  </td>
                  <td className="holding-row-actions" style={{ padding: '12px 12px', textAlign: 'right' }}>
                    <div className="holding-row-actions-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                      {showActions && (
                        <>
                          <button onClick={e => { e.stopPropagation(); onOpenPnl(asset); }} title="View P&L" style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#777' }}>
                            <Calculator size={13} />
                          </button>
                          {onHide && (
                            <button onClick={e => { e.stopPropagation(); onHide(asset.id); }} title="Hide" style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)' }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </>
                      )}
                      <span style={{ color: isExpanded ? 'var(--accent)' : 'var(--fg-subtle)', padding: 4, display: 'inline-flex' }}>
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </span>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="holding-detail-row" style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${chainColors[asset.chain] || '#333'}`, background: 'var(--bg-elevated)' }}>
                    <td colSpan={9} style={{ padding: '0 16px 14px' }}>
                      <div className="asset-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, paddingTop: 12 }}>
                        <DetailCard title="Price">
                          <DetailRow label="USD" value={fmtPrice(asset.priceUsd)} />
                          <DetailRow label="PLS" value={`${fmtCompact(asset.pricePls)} PLS`} accent />
                          <DetailRow label="24H" value={`${pct >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(2)}%`} valueColor={pct >= 0 ? 'var(--accent)' : '#ef4444'} />
                          <DetailRow label="Liquidity" value={md?.liquidity ? fmtUsd(md.liquidity, 0) : '-'} />
                        </DetailCard>
                        <DetailCard title="Your Holdings">
                          <DetailRow label="Amount" value={`${fmtAmount(asset.balance)} ${asset.symbol}`} />
                          <DetailRow label="USD value" value={fmtUsd(asset.valueUsd)} />
                          <DetailRow label="PLS value" value={`${fmtCompact(asset.valuePls)} PLS`} accent />
                          <DetailRow label="% portfolio" value={`${share.toFixed(2)}%`} />
                        </DetailCard>
                        <DetailCard title="PLS P&L">
                          {pnlPls !== null ? (
                            <>
                              <DetailRow label="Entry" value={`${fmtCompact(entryPls)} PLS`} />
                              <DetailRow label="Now" value={`${fmtCompact(asset.valuePls)} PLS`} />
                              <DetailRow label="Net" value={`${pnlPls >= 0 ? '+' : ''}${fmtCompact(pnlPls)} PLS`} valueColor={pnlPls >= 0 ? 'var(--accent)' : '#ef4444'} />
                              <button onClick={e => { e.stopPropagation(); onClearEntry(asset.id); }} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--fg-subtle)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, fontSize: 12 }}>
                                <X size={12} /> Clear entry
                              </button>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 8 }}>Set entry to track P&L in PLS.</div>
                              <input type="number" placeholder="Entry PLS amount" onClick={e => e.stopPropagation()} onBlur={e => { const value = Number(e.currentTarget.value); if (Number.isFinite(value) && value > 0) onSetEntry(asset.id, value); }} style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: 12, padding: '6px 8px', outline: 'none' }} />
                            </>
                          )}
                        </DetailCard>
                        <DetailCard title="League">
                          <DetailRow label="Status" value={asset.leagueLabel === '-' ? '-' : asset.leagueLabel} accent={asset.leagueLabel !== '-'} />
                          <DetailRow label="Rank" value={asset.leagueRank ? `#${asset.leagueRank}` : '-'} />
                          <DetailRow label="Source" value={asset.leagueSource || 'OpenPulseChain'} />
                        </DetailCard>
                        <DetailCard title="Links">
                          {addr && addr !== 'native' && (
                            <DetailRow label="Contract" value={`${addr.slice(0, 6)}...${addr.slice(-4)}`} />
                          )}
                          {explUrl && <DetailLink href={explUrl} label="Explorer" />}
                          {dsUrl && addr !== 'native' && <DetailLink href={dsUrl} label="DexScreener" />}
                        </DetailCard>
                      </div>
                      {previewTxs.length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px' }}>Transactions & P&L</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: 20, border: '1px solid var(--border)' }}>{tokenTxs.length}</span>
                          </div>
                          <TransactionList
                            transactions={previewTxs}
                            viewAsYou
                            wallets={wallets}
                            compact
                            assets={allAssets}
                            getTokenLogoUrl={getTokenLogoUrl}
                            tokenLogos={tokenLogos}
                            onFilterByAsset={onFilterByAsset}
                            emptyMessage="No transactions for this token."
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        {sortedAssets.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td colSpan={4} style={{ padding: '10px 16px', fontSize: 13, color: 'var(--fg-muted)', fontWeight: 700 }}>{footerLabel}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--fg)' }}>{fmtUsd(tableTotalUsd, 0)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#f739ff' }}>{fmtCompact(tableTotalPls)} PLS</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="asset-detail-card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div className="asset-detail-card-title" style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>{title}</div>
      <div className="asset-detail-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value, accent, valueColor }: { label: string; value: React.ReactNode; accent?: boolean; valueColor?: string }) {
  return (
    <div className="asset-detail-row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span className="asset-detail-label" style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{label}</span>
      <span className="asset-detail-value" style={{ fontSize: 13, fontWeight: 700, color: valueColor || (accent ? '#f739ff' : 'var(--fg)'), textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function DetailLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
      <ExternalLink size={11} /> {label}
    </a>
  );
}
