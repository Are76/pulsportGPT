import React, { useEffect, useCallback } from 'react';
import { X, Copy, ExternalLink, TrendingUp, TrendingDown, Globe, Twitter, Send } from 'lucide-react';
import type { Asset } from '../types';

// -- helpers -----------------------------------------------------------------

function fmtPrice(p: number): string {
  if (p <= 0) return '-';
  if (p < 0.000001) return `$${p.toFixed(10)}`;
  if (p < 0.0001)   return `$${p.toFixed(8)}`;
  if (p < 0.01)     return `$${p.toFixed(6)}`;
  if (p < 1)        return `$${p.toFixed(4)}`;
  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtUsd(v: number): string {
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtBalance(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(3)}B`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(3)}M`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(2)}K`;
  return b.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function ChangeRow({ label, pct, theme }: { label: string; pct: number | null | undefined; theme: 'dark' | 'light' }) {
  if (pct == null) {
    return (
      <div className="tcm-change-row">
        <span className="tcm-change-label">{label}</span>
        <span className="tcm-change-na">-</span>
      </div>
    );
  }
  const green = theme === 'dark' ? 'var(--accent)' : '#059669';
  const red   = theme === 'dark' ? '#f43f5e' : '#dc2626';
  const color = pct >= 0 ? green : red;
  const Icon  = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="tcm-change-row">
      <span className="tcm-change-label">{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 13, color, fontFamily: 'var(--font-shell-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        <Icon size={12} />
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

// -- props --------------------------------------------------------------------

interface Props {
  asset: Asset;
  portfolioTotal: number;
  logoUrl?: string;
  marketData?: {
    liquidity?: number;
    volume24h?: number;
    marketCap?: number | null;
    fdv?: number | null;
    pools?: number;
    txns24h?: number;
    nativePriceUsd?: string | null;
    priceChange1h?: number | null;
    priceChange6h?: number | null;
    priceChange24h?: number | null;
    priceChange7d?: number | null;
    holders?: number | null;
    description?: string | null;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  } | undefined;
  isLoadingMarketData?: boolean;
  theme: 'dark' | 'light';
  onClose: () => void;
  dexScreenerUrl?: string;
  explorerUrl?: string;
}

const CHAIN_LABELS: Record<string, string> = {
  pulsechain: 'PulseChain',
  ethereum: 'Ethereum',
  base: 'Base',
};

const CHAIN_COLORS: Record<string, string> = {
  pulsechain: '#f739ff',
  ethereum:   '#8aa4f0',
  base:       '#60a5fa',
};

// -- component ----------------------------------------------------------------

export function TokenCardModal({
  asset, portfolioTotal, logoUrl, marketData, isLoadingMarketData = false,
  theme, onClose, dexScreenerUrl, explorerUrl,
}: Props) {
  const [copied, setCopied] = React.useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const addr   = asset.address;
  const pct24h = asset.priceChange24h ?? asset.pnl24h ?? 0;
  const green  = theme === 'dark' ? '#00FF9F' : '#059669';
  const red    = theme === 'dark' ? '#f43f5e' : '#dc2626';
  const share  = (asset.value / Math.max(portfolioTotal, 1)) * 100;

  const changeColor = pct24h >= 0 ? green : red;

  const mcap    = marketData?.marketCap || marketData?.fdv || null;
  const liq     = marketData?.liquidity;
  const vol24h  = marketData?.volume24h;
  const txns24h = marketData?.txns24h;
  const pools   = marketData?.pools;

  const copyAddr = () => {
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shortAddr = addr && addr !== 'native'
    ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
    : null;

  return (
    <div
      className="tcm-backdrop"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="tcm-panel" role="dialog" aria-modal="true" aria-label={`${asset.symbol} - Token Details`}>

        {/* -- HEADER -- */}
        <div className="tcm-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Logo */}
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: 'var(--bg-elevated)',
              border: `2px solid ${CHAIN_COLORS[asset.chain] || 'rgba(255,255,255,0.15)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', fontSize: 16, fontWeight: 800, color: 'var(--fg)',
            }}>
              {logoUrl ? (
                <img src={logoUrl} alt={asset.symbol}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : asset.symbol[0]}
            </div>
            {/* Name block */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {asset.symbol}
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 1 }}>
                {asset.name}
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: CHAIN_COLORS[asset.chain] || 'var(--fg-subtle)',
                  background: `${CHAIN_COLORS[asset.chain] || 'rgba(255,255,255,0.1)'}22`,
                  border: `1px solid ${CHAIN_COLORS[asset.chain] || 'rgba(255,255,255,0.1)'}55`,
                  borderRadius: 4, padding: '1px 5px', letterSpacing: '.3px' }}>
                  {CHAIN_LABELS[asset.chain] || asset.chain}
                </span>
              </div>
            </div>
          </div>
          {/* Close */}
          <button className="tcm-close-btn" onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* -- CA / LINKS -- */}
        {shortAddr && (
          <div className="tcm-ca-row">
            <span style={{ fontSize: 12, color: 'var(--fg-subtle)', fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>{shortAddr}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="tcm-icon-btn" onClick={copyAddr} title="Copy contract address">
                {copied
                  ? <span style={{ fontSize: 11, color: green, fontWeight: 700 }}>✓ Copied</span>
                  : <><Copy size={13} /> <span style={{ fontSize: 11 }}>Contract Address</span></>}
              </button>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="tcm-icon-btn" title="View on explorer">
                  <ExternalLink size={13} /> <span style={{ fontSize: 11 }}>Explorer</span>
                </a>
              )}
              {dexScreenerUrl && (
                <a href={dexScreenerUrl} target="_blank" rel="noopener noreferrer" className="tcm-icon-btn tcm-ds-btn" title="View on DexScreener">
                  <ExternalLink size={13} /> <span style={{ fontSize: 11 }}>DexScreener</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* -- Scrollable body -- */}
        <div className="tcm-body">

          {/* -- PRICE HERO -- */}
          <div className="tcm-section tcm-price-hero">
            <div className="tcm-price-row" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 }}>Current Price</div>
                <div className="tcm-price-number" style={{ fontSize: 30, fontWeight: 800, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {fmtPrice(asset.price)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 }}>24h Change</div>
                <div className="tcm-change-number" style={{
                  fontSize: 22, fontWeight: 800, color: changeColor,
                  fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {pct24h >= 0 ? '▲' : '▼'} {Math.abs(pct24h).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* -- PRICE CHANGES -- */}
          <div className="tcm-section">
            <div className="tcm-section-title">Price Changes</div>
            <div className="tcm-changes-grid">
              <ChangeRow label="1H"  pct={asset.priceChange1h ?? marketData?.priceChange1h} theme={theme} />
              <ChangeRow label="6H"  pct={marketData?.priceChange6h} theme={theme} />
              <ChangeRow label="1D"  pct={asset.priceChange24h ?? asset.pnl24h ?? marketData?.priceChange24h} theme={theme} />
              <ChangeRow label="7D"  pct={asset.priceChange7d ?? marketData?.priceChange7d} theme={theme} />
              <ChangeRow label="1M"  pct={null} theme={theme} />
              <ChangeRow label="1Y"  pct={null} theme={theme} />
            </div>
            <div className="tcm-ath-atl-row">
              <div className="tcm-ath-cell">
                <span className="tcm-ath-label">ATH</span>
                <span className="tcm-ath-val">-</span>
              </div>
              <div className="tcm-ath-divider" />
              <div className="tcm-ath-cell">
                <span className="tcm-ath-label">ATL</span>
                <span className="tcm-ath-val">-</span>
              </div>
            </div>
          </div>

          {/* -- YOUR HOLDINGS -- */}
          <div className="tcm-section">
            <div className="tcm-section-title">Token Details</div>
            <div className="tcm-holdings-grid">
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Held</div>
                <div className="tcm-stat-value" style={{ fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em' }}>
                  {fmtBalance(asset.balance)}
                  <span style={{ fontSize: 11, color: 'var(--fg-subtle)', marginLeft: 4 }}>{asset.symbol}</span>
                </div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">USD Value</div>
                <div className="tcm-stat-value" style={{ color: green }}>{fmtUsd(asset.value)}</div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">% of Portfolio</div>
                <div className="tcm-stat-value">{share.toFixed(2)}%</div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Price x Qty</div>
                <div className="tcm-stat-value" style={{ fontFamily: 'var(--font-shell-display)', fontSize: 12, letterSpacing: '-0.01em' }}>
                  {fmtPrice(asset.price)} x {fmtBalance(asset.balance)}
                </div>
              </div>
            </div>
          </div>

          {/* -- MARKET DATA -- */}
          <div className="tcm-section">
            <div className="tcm-section-title">
              Market Data
              {isLoadingMarketData && (
                <span style={{ fontSize: 11, color: 'var(--fg-subtle)', marginLeft: 6, fontWeight: 400 }}>Loading...</span>
              )}
            </div>
            <div className="tcm-market-grid">
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Market Cap</div>
                <div className="tcm-stat-value">{mcap ? fmtUsd(mcap) : '-'}</div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Liquidity</div>
                <div className="tcm-stat-value" style={{ color: liq ? green : 'var(--fg-subtle)' }}>
                  {liq ? fmtUsd(liq) : '-'}
                </div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Volume 24h</div>
                <div className="tcm-stat-value">{vol24h ? fmtUsd(vol24h) : '-'}</div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Txns 24h</div>
                <div className="tcm-stat-value">{txns24h != null ? txns24h.toLocaleString() : '-'}</div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Pools</div>
                <div className="tcm-stat-value">{pools != null ? pools : '-'}</div>
              </div>
              <div className="tcm-stat-cell">
                <div className="tcm-stat-label">Holders</div>
                <div className="tcm-stat-value">
                  {marketData?.holders
                    ? marketData.holders >= 1e6
                      ? `${(marketData.holders / 1e6).toFixed(2)}M`
                      : marketData.holders >= 1e3
                        ? `${(marketData.holders / 1e3).toFixed(1)}K`
                        : marketData.holders.toLocaleString()
                    : '-'}
                </div>
              </div>
              {marketData?.nativePriceUsd && (
                <div className="tcm-stat-cell">
                  <div className="tcm-stat-label">Price in PLS</div>
                  <div className="tcm-stat-value" style={{ fontFamily: 'var(--font-shell-display)', fontSize: 12, letterSpacing: '-0.01em' }}>
                    {parseFloat(marketData.nativePriceUsd).toLocaleString('en-US', { maximumSignificantDigits: 5 })} PLS
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* -- ABOUT -- */}
          {(marketData?.description || (marketData?.websites?.length ?? 0) > 0 || (marketData?.socials?.length ?? 0) > 0) && (
            <div className="tcm-section">
              <div className="tcm-section-title">About</div>
              {marketData?.description && (
                <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.65, marginBottom: 12, marginTop: 0 }}>
                  {marketData.description}
                </p>
              )}
              {((marketData?.websites?.length ?? 0) > 0 || (marketData?.socials?.length ?? 0) > 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {marketData?.websites?.map((w, i) => (
                    <a key={`w-${i}`} href={w.url} target="_blank" rel="noopener noreferrer" className="tcm-social-link">
                      <Globe size={11} />
                      {w.label || 'Website'}
                    </a>
                  ))}
                  {marketData?.socials?.map((s, i) => {
                    const type = s.type?.toLowerCase() ?? '';
                    const label = type === 'twitter' ? 'Twitter / X' : type === 'telegram' ? 'Telegram' : (s.type?.charAt(0).toUpperCase() ?? '') + (s.type?.slice(1) ?? '');
                    const Icon = type === 'twitter' ? Twitter : type === 'telegram' ? Send : ExternalLink;
                    return (
                      <a key={`s-${i}`} href={s.url} target="_blank" rel="noopener noreferrer" className="tcm-social-link">
                        <Icon size={11} />
                        {label}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
        {/* -- footer -- */}
        <div className="tcm-footer">
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
            Data from DexScreener · prices update every ~60s
          </span>
          <button className="tcm-close-text-btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
