import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, ExternalLink, RefreshCcw, Shield, Zap, CreditCard, ArrowUpDown, Copy, Check } from 'lucide-react';

const BRIDGE_TOKENS = [
  { symbol: 'pWETH', name: 'Wrapped Ether',  address: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', decimals: 18, coingeckoId: 'ethereum', color: '#627EEA' },
  { symbol: 'pDAI',  name: 'DAI Stablecoin', address: '0xefd766ccb38eaf1dfd701853bfce31359239f305', decimals: 18, coingeckoId: 'dai',      color: '#f5a623' },
  { symbol: 'pUSDC', name: 'USD Coin',        address: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', decimals: 6,  coingeckoId: 'usd-coin', color: '#2775ca' },
  { symbol: 'pUSDT', name: 'Tether USD',      address: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', decimals: 6,  coingeckoId: 'tether',   color: '#26a17b' },
  { symbol: 'pWBTC', name: 'Wrapped Bitcoin', address: '0xb17d901469b9208b17d916112988a3fed19b5ca1', decimals: 8,  coingeckoId: 'bitcoin',  color: '#f7931a' },
  { symbol: 'eHEX',  name: 'HEX (bridged)',   address: '0x57fde0a71132198bbec939b98976993d8d89d225', decimals: 8,  coingeckoId: 'hex',      color: '#ff00ff' },
];

const CORE_TOKENS = [
  { symbol: 'PLS', role: 'Native gas', contract: 'native', note: 'Pays PulseChain transaction fees.', color: 'var(--accent)' },
  { symbol: 'WPLS', role: 'Wrapped PLS', contract: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', note: 'ERC20-style PLS for DeFi pools.', color: '#06b6d4' },
  { symbol: 'PLSX', role: 'PulseX token', contract: '0x95b303987a60c71504d99aa1b13b4da07b0790ab', note: 'PulseX DEX token with buy-and-burn mechanics.', color: '#f739ff' },
  { symbol: 'INC', role: 'Farm incentive', contract: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', note: 'Earned by PulseX liquidity farmers.', color: '#22d3ee' },
  { symbol: 'pHEX', role: 'HEX on PulseChain', contract: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', note: 'Fork-copy HEX that can be staked on PulseChain.', color: '#a855f7' },
];

const BRIDGED_REFERENCE = [
  { symbol: 'eHEX', contract: '0x57fde0a71132198bbec939b98976993d8d89d225', note: 'Ethereum HEX bridged to PulseChain. Not pHEX staking HEX.' },
  { symbol: 'pDAI', contract: '0xefd766ccb38eaf1dfd701853bfce31359239f305', note: 'Market-priced DAI bridge token. Do not assume $1.' },
  { symbol: 'pUSDC', contract: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', note: 'Market-priced USDC bridge token.' },
  { symbol: 'pUSDT', contract: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', note: 'Market-priced USDT bridge token.' },
  { symbol: 'pWETH', contract: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', note: 'Wrapped ETH bridged to PulseChain.' },
  { symbol: 'pWBTC', contract: '0xb17d901469b9208b17d916112988a3fed19b5ca1', note: 'Wrapped BTC bridged to PulseChain.' },
];

const QUICK_CHECKS = [
  ['PulseChain', 'EVM-compatible Layer 1, chain ID 369, native gas token PLS.'],
  ['pHEX vs eHEX', 'pHEX is the fork-copy staking token. eHEX is bridged Ethereum HEX on a different PulseChain contract.'],
  ['Bridged stables', 'pDAI, pUSDC, and pUSDT are market-priced on PulseChain. Always verify live price.'],
];

interface TokenData {
  symbol: string; name: string; address: string; decimals: number; color: string;
  supply: number | null; price: number | null; tvl: number | null;
}

const SCANNER = 'https://api.scan.pulsechain.com/api';
const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtAmount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(4);
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--fg-muted)' }}>
      {copied ? <Check size={11} color="var(--accent)" /> : <Copy size={11} />}
    </button>
  );
}

function DropdownSection({ title, icon, color, badge, children }: {
  title: string; icon: React.ReactNode; color: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <details style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
      <summary style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px',
        background: `${color}0d`,
        borderLeft: `3px solid ${color}`,
        cursor: 'pointer',
        listStyle: 'none',
      }}>
        {icon}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: `${color}22`, color, border: `1px solid ${color}44` }}>
            {badge}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 700 }}>Open</span>
      </summary>
      <div style={{ padding: 20, borderTop: `1px solid ${color}28` }}>{children}</div>
    </details>
  );
}

// -- Stat box ------------------------------------------------------------------
function StatBox({ label, value, sub, color = 'var(--accent)', mono = false }: {
  key?: React.Key; label: string; value: string; sub?: string; color?: string; mono?: boolean;
}) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderBottom: `2px solid ${color}`, borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.5px', fontFamily: 'var(--font-shell-display)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function BridgeDashboardPage({ afterOfficialBridge }: { afterOfficialBridge?: React.ReactNode }) {
  const [tokens, setTokens] = useState<TokenData[]>(
    BRIDGE_TOKENS.map(t => ({ ...t, supply: null, price: null, tvl: null }))
  );
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const supplyResults = await Promise.all(
        BRIDGE_TOKENS.map(async t => {
          try {
            const res = await fetch(`${SCANNER}?module=stats&action=tokensupply&contractaddress=${t.address}`);
            const data = await res.json();
            if (data.status === '1' && data.result) return Number(BigInt(data.result)) / Math.pow(10, t.decimals);
            return null;
          } catch { return null; }
        })
      );
      const ids = [...new Set(BRIDGE_TOKENS.map(t => t.coingeckoId))].join(',');
      let prices: Record<string, number> = {};
      try {
        const res = await fetch(`${COINGECKO}?ids=${ids}&vs_currencies=usd`);
        const data = await res.json();
        Object.entries(data).forEach(([id, val]) => { prices[id] = (val as { usd: number }).usd; });
      } catch { /* leave empty */ }
      setTokens(BRIDGE_TOKENS.map((t, i) => {
        const supply = supplyResults[i];
        const price = prices[t.coingeckoId] ?? null;
        return { ...t, supply, price, tvl: supply != null && price != null ? supply * price : null };
      }));
      setLastUpdated(new Date());
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalTvl = tokens.reduce((sum, t) => sum + (t.tvl ?? 0), 0);
  const knownTvl = tokens.some(t => t.tvl != null);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 48 }}>

      {/* -- HERO BANNER ------------------------------------------------------- */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(0,255,159,0.035) 100%)',
        border: '1px solid var(--border)', borderTop: '3px solid var(--accent)',
        borderRadius: 16, padding: '28px 28px 24px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowLeftRight size={22} color="var(--accent)" />
            </div>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--fg)', margin: 0, letterSpacing: '-0.5px' }}>PulseChain Bridge</h1>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '3px 0 0' }}>Real-time cross-chain bridge statistics and activity monitoring</p>
            </div>
          </div>
          <button onClick={fetchData} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, alignSelf: 'flex-start' }}>
            <RefreshCcw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Big stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <StatBox label="Official Bridge TVL" value={knownTvl ? fmt(totalTvl) : '-'} sub="Live on-chain data" color="var(--accent)" mono />
          <StatBox label="Bridge Options" value="3" sub="Official · Hyperlane · Liberty" color="#627EEA" />
          <StatBox label="On-Ramp Options" value="4" sub="RampNow · ChangeNow · 0xCoast · Guardarian" color="#f59e0b" />
          <StatBox label="Bridged Tokens" value={`${BRIDGE_TOKENS.length}`} sub="Via official bridge" color="#a855f7" />
        </div>
        {lastUpdated && (
          <p style={{ fontSize: 11, color: 'var(--fg-subtle)', margin: '12px 0 0', textAlign: 'right' }}>
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* -- Official PulseChain Bridge ----------------------------------------- */}
      <DropdownSection title="Official PulseChain Bridge" icon={<Zap size={15} color="var(--accent)" />} color="var(--accent)" badge="Live TVL">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, margin: '0 0 18px' }}>
          The official Ethereum ↔ PulseChain bridge (OmniBridge-based). Bridging from Ethereum mints a wrapped token on PulseChain at a different contract address. Bridged stablecoins (pDAI, pUSDC, pUSDT) are <strong style={{ color: 'var(--fg)' }}>not pegged to $1</strong> - always check live prices.
        </p>

        {/* TVL highlight */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--accent)', borderRadius: '0 10px 10px 0',
          padding: '16px 20px', marginBottom: 18,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Total Bridged Value Locked</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-1px', fontFamily: 'var(--font-shell-display)' }}>
              {loading && !knownTvl ? '-' : knownTvl ? fmt(totalTvl) : '-'}
            </div>
          </div>
          <a href="https://bridge.pulsechain.com" target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', padding: '9px 16px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 8 }}>
            Open Bridge <ExternalLink size={12} />
          </a>
        </div>

        {/* Token table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Token', 'Bridged Supply', 'Price (USD)', 'TVL', 'Contract'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', color: 'var(--fg-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tokens.map((t, i) => (
                <tr key={t.address} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${t.color}22`, border: `1px solid ${t.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: t.color, flexShrink: 0 }}>
                        {t.symbol[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--fg)', fontSize: 13 }}>{t.symbol}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{t.name}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--fg)', fontWeight: 700, fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em' }}>
                    {t.supply != null ? fmtAmount(t.supply) : <span style={{ color: 'var(--fg-subtle)' }}>-</span>}
                  </td>
                  <td style={{ padding: '11px 12px', color: 'var(--fg-muted)', fontWeight: 700, fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em' }}>
                    {t.price != null ? (t.price < 0.001 ? `$${t.price.toFixed(8)}` : t.price < 1 ? `$${t.price.toFixed(6)}` : `$${t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`) : '-'}
                  </td>
                  <td style={{ padding: '11px 12px', fontWeight: 800, fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em', color: t.tvl != null ? 'var(--fg)' : 'var(--fg-subtle)' }}>
                    {t.tvl != null ? fmt(t.tvl) : '-'}
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <a href={`https://scan.pulsechain.com/token/${t.address}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: 'var(--font-shell-display)', fontSize: 11, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--accent)', textDecoration: 'none' }}>
                        {t.address.slice(0, 6)}...{t.address.slice(-4)}
                      </a>
                      <CopyBtn text={t.address} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-subtle)', lineHeight: 1.6 }}>
          TVL = total supply of each bridged token x current market price. Supply from PulseChain scanner. Prices from CoinGecko.
        </div>
      </DropdownSection>

      {afterOfficialBridge}

      {/* -- Hyperlane ----------------------------------------------------------- */}
      <DropdownSection title="Hyperlane" icon={<ArrowUpDown size={15} color="#627EEA" />} color="#627EEA" badge="160+ Chains">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, margin: '0 0 18px' }}>
          Hyperlane is a permissionless interoperability layer connecting 160+ blockchains. Deployed on PulseChain with a Mailbox contract for cross-chain messaging. Warp Routes allow native token bridging - USDC from Ethereum and other chains can be sent directly to PulseChain via intent-based messaging.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Chains Connected', value: '160+', sub: 'Permissionless', color: '#627EEA' },
            { label: 'PulseChain Domain', value: '369', sub: 'Same as chain ID', color: '#627EEA' },
            { label: 'Protocol', value: 'Open Source', sub: 'Modular security', color: '#627EEA' },
          ].map(({ label, value, sub, color }) => (
            <StatBox key={label} label={label} value={value} sub={sub} color={color} />
          ))}
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>PulseChain Contract Addresses</div>
          {[
            { label: 'Mailbox', address: '0x56176C7Fb66FdD70ef962Ae53a46A226c7F6a2Cc' },
            { label: 'Interchain Gas Paymaster', address: '0xc996F4D7d7F39189921A08F3DaAf1b9ff0b20006' },
            { label: 'Merkle Tree Hook', address: '0x9DaC51dF95298453C7fb5b43233818CfA4604daC' },
          ].map(({ label, address }) => (
            <div key={address} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)', minWidth: 180 }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <a href={`https://scan.pulsechain.com/address/${address}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-shell-display)', fontSize: 11, letterSpacing: '-0.01em', color: '#627EEA', textDecoration: 'none' }}>
                  {address.slice(0, 10)}...{address.slice(-6)}
                </a>
                <CopyBtn text={address} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'hyperlane.xyz', url: 'https://hyperlane.xyz', color: '#627EEA' },
            { label: 'Hyperlane Explorer', url: 'https://explorer.hyperlane.xyz/?search=pulsechain', color: 'var(--fg-muted)' },
            { label: 'Nexus Bridge', url: 'https://nexus.hyperlane.xyz', color: 'var(--fg-muted)' },
          ].map(({ label, url, color }) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color, textDecoration: 'none', padding: '7px 13px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
              {label} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      </DropdownSection>

      {/* -- Liberty Swap -------------------------------------------------------- */}
      <DropdownSection title="Liberty Swap" icon={<Shield size={15} color="#a855f7" />} color="#a855f7" badge="Privacy Bridge">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, margin: '0 0 18px' }}>
          Intent-based cross-chain DEX with zero-knowledge privacy. Unlike pool-based bridges, Liberty Swap never takes custody of your assets - independent executors fulfill orders on the destination chain. Transaction data is deleted after 48 hours. No registration required.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Protocol Fee', value: '0.3%', sub: 'Flat on all swaps', color: '#a855f7' },
            { label: 'Min / Max', value: '$10-$25K', sub: 'Per transaction', color: '#a855f7' },
            { label: 'Swap Speed', value: '~2-3 min', sub: 'Typical settle time', color: '#a855f7' },
            { label: 'Privacy', value: 'ZK Proofs', sub: 'Data deleted 48h', color: '#a855f7' },
          ].map(({ label, value, sub, color }) => (
            <StatBox key={label} label={label} value={value} sub={sub} color={color} />
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>Supported Routes to PulseChain</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Ethereum', 'Base', 'Arbitrum', 'BNB Chain', 'Polygon', 'Optimism', 'Solana'].map(chain => (
              <span key={chain} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 100, background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>
                  {chain} {'->'} PulseChain
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{'Router Contract (Base -> PulseChain)'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <a href="https://basescan.org/address/0xcf3d89aedd07ee94e5c45037581744e2d9f0b9fc" target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-shell-display)', fontSize: 12, letterSpacing: '-0.01em', color: '#a855f7', textDecoration: 'none' }}>
              0xcf3d89aedd07ee94e5c45037581744e2d9f0b9fc
            </a>
            <CopyBtn text="0xcf3d89aedd07ee94e5c45037581744e2d9f0b9fc" />
          </div>
        </div>

        <a href="https://libertyswap.finance" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#a855f7', textDecoration: 'none', padding: '8px 14px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8 }}>
          libertyswap.finance <ExternalLink size={11} />
        </a>
      </DropdownSection>

      {/* -- On-Ramps ------------------------------------------------------------ */}
      <DropdownSection title="Fiat & Crypto On-Ramps" icon={<CreditCard size={15} color="#f59e0b" />} color="#f59e0b" badge="Direct to PulseChain">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, margin: '0 0 18px' }}>
          Direct fiat and crypto on-ramp services with native PulseChain support - buy PLS, HEX, and other PulseChain tokens without touching Ethereum first.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {[
            {
              name: 'RampNow', url: 'https://rampnow.io', tag: 'Fiat On/Off Ramp', color: '#f59e0b',
              desc: 'Direct fiat-to-PulseChain ramp supporting PLS, HEX, and 1,500+ tokens across 60+ chains. Accepts Apple Pay, Google Pay, iDEAL, and bank transfer. Lowest fees, 99% uptime, fully regulated. 160 countries.',
              stats: [{ label: 'Chains', value: '60+' }, { label: 'Tokens', value: '1,500+' }, { label: 'Countries', value: '160' }],
            },
            {
              name: 'ChangeNow', url: 'https://changenow.io', tag: 'Crypto Swap', color: '#06b6d4',
              desc: 'Non-custodial crypto exchange supporting 1,400+ currencies including PLS. No registration required, unlimited amounts, best available rates. Swap any crypto directly to PLS.',
              stats: [{ label: 'Currencies', value: '1,400+' }, { label: 'Registration', value: 'None' }, { label: 'Custody', value: 'Non-custodial' }],
            },
            {
              name: '0xCoast', url: 'https://0xcoast.com', tag: 'CST Stablecoin', color: 'var(--accent)',
              desc: 'Direct fiat on/off ramp for PulseChain using the CST stablecoin. Buy and sell PulseChain assets with bank fiat - no bridges required. CST supply growth is tracked on PulseChainStats.',
              stats: [{ label: 'Stablecoin', value: 'CST' }, { label: 'Route', value: 'Fiat ↔ PLS' }],
            },
            {
              name: 'Guardarian', url: 'https://guardarian.com', tag: 'EU Licensed', color: '#a855f7',
              desc: 'EU-regulated fiat-to-crypto conversion service supporting PulseChain assets. Buy crypto with credit/debit cards and bank transfers in minutes.',
              stats: [{ label: 'Regulated', value: 'EU Licensed' }, { label: 'Methods', value: 'Card + Bank' }],
            },
          ].map(p => (
            <div key={p.name} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: `2px solid ${p.color}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: p.color, flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}44` }}>{p.tag}</span>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-muted)' }}><ExternalLink size={13} /></a>
              </div>
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 10px', lineHeight: 1.6 }}>{p.desc}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.stats.map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 6, padding: '5px 10px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', marginTop: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DropdownSection>

      <DropdownSection title="Core PulseChain Contracts" icon={<Zap size={15} color="var(--accent)" />} color="var(--accent)" badge="Reference">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, margin: '0 0 18px' }}>
          PulseChain fork copies, native assets, and bridged tokens can share familiar names while trading as separate markets.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {CORE_TOKENS.map(token => (
            <div key={token.symbol} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: `2px solid ${token.color}`, borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <strong style={{ color: token.color, fontSize: 18 }}>{token.symbol}</strong>
                <span style={{ color: 'var(--fg-subtle)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{token.role}</span>
              </div>
              <p style={{ color: 'var(--fg-muted)', fontSize: 12, lineHeight: 1.55, margin: '0 0 10px' }}>{token.note}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <code style={{ color: 'var(--fg-subtle)', fontSize: 11, overflowWrap: 'anywhere' }}>
                  {token.contract === 'native' ? 'native' : `${token.contract.slice(0, 10)}...${token.contract.slice(-4)}`}
                </code>
                {token.contract !== 'native' && <CopyBtn text={token.contract} />}
              </div>
            </div>
          ))}
        </div>
      </DropdownSection>

      <DropdownSection title="Bridged Token Reference" icon={<Shield size={15} color="#22d3ee" />} color="#22d3ee" badge="Do not assume $1">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {BRIDGED_REFERENCE.map(token => (
            <div key={token.symbol} style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(34,211,238,0.22)', borderRadius: 8, padding: 14 }}>
              <strong style={{ display: 'block', color: '#22d3ee', fontSize: 15, marginBottom: 4 }}>{token.symbol}</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                <code style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>{token.contract.slice(0, 8)}...{token.contract.slice(-4)}</code>
                <CopyBtn text={token.contract} />
              </div>
              <p style={{ color: 'var(--fg-muted)', fontSize: 12, lineHeight: 1.55, margin: 0 }}>{token.note}</p>
            </div>
          ))}
        </div>
      </DropdownSection>

      <DropdownSection title="Quick Bridge Checks" icon={<ArrowLeftRight size={15} color="#627EEA" />} color="#627EEA" badge="Safety">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {QUICK_CHECKS.map(([title, body]) => (
            <div key={title} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <strong style={{ display: 'block', color: 'var(--fg)', fontSize: 14, marginBottom: 6 }}>{title}</strong>
              <p style={{ color: 'var(--fg-muted)', fontSize: 12, lineHeight: 1.55, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </DropdownSection>
    </div>
  );
}
