import { Copy, ExternalLink, Check, Zap, Cpu, Shield, Globe2 } from 'lucide-react';
import { useState } from 'react';

const NETWORK_ROWS = [
  ['Network name', 'PulseChain'],
  ['Chain ID', '369'],
  ['Currency symbol', 'PLS'],
  ['Primary RPC', 'https://rpc-pulsechain.g4mm4.io'],
  ['Backup RPC', 'https://pulsechain.publicnode.com'],
  ['Explorer', 'https://scan.pulsechain.com'],
];

const QUICK_LINKS = [
  ['PulseChain', 'https://pulsechain.com'],
  ['Explorer', 'https://scan.pulsechain.com'],
  ['PulseX', 'https://app.pulsex.com'],
  ['Bridge', 'https://bridge.pulsechain.com'],
  ['Launchpad', 'https://launchpad.pulsechain.com'],
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      style={{ border: 0, background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', padding: 2 }}
      aria-label={`Copy ${text}`}
    >
      {copied ? <Check size={12} color="var(--accent)" /> : <Copy size={12} />}
    </button>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function PulseChainOfficialPage() {
  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', paddingBottom: 48 }}>
      <section style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '28px',
        background: 'linear-gradient(135deg, rgba(0,255,159,0.09), rgba(7,8,16,0.02) 42%, var(--bg-surface))',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
            <Zap size={22} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.12em' }}>Network Reference</div>
            <h1 style={{ margin: '2px 0 0', color: 'var(--fg)', fontSize: 34, lineHeight: 1, fontWeight: 900 }}>PulseChain</h1>
          </div>
        </div>
        <p style={{ maxWidth: 760, color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 22px' }}>
          PulseChain is an EVM-compatible Layer 1 and full Ethereum state fork with PLS as the native gas token. This page is the compact setup reference. Project guides, core tokens, bridges, DEXs, and ecosystem resources now live on PulseChain Ecosystem.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Stat label="Chain ID" value="369" sub="0x171" />
          <Stat label="Native Token" value="PLS" sub="Gas token" />
          <Stat label="Block Time" value="~10s" sub="Proof of Stake" />
          <Stat label="Fork Type" value="L1" sub="Ethereum state fork" />
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, .9fr)', gap: 14 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Cpu size={16} color="var(--accent)" />
            <strong style={{ color: 'var(--fg)' }}>Wallet Network Settings</strong>
          </div>
          <div style={{ padding: 18, display: 'grid', gap: 8 }}>
            {NETWORK_ROWS.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg-elevated)' }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 12, fontWeight: 800 }}>{label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <code style={{ color: 'var(--fg)', fontSize: 12, fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{value}</code>
                  <CopyButton text={value} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
            <Shield size={16} color="#f59e0b" />
            <strong style={{ color: 'var(--fg)' }}>Safety Notes</strong>
          </div>
          <div style={{ display: 'grid', gap: 10, color: 'var(--fg-muted)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>PulseChain tokens are separate from Ethereum tokens even when addresses match.</p>
            <p style={{ margin: 0 }}>Bridged stablecoins such as pDAI, pUSDC, and pUSDT are market-priced. Do not assume $1.</p>
            <p style={{ margin: 0 }}>Verify chain ID 369 before signing transactions or adding custom RPC endpoints.</p>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <Globe2 size={16} color="var(--accent)" />
          <strong style={{ color: 'var(--fg)' }}>Official Links</strong>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_LINKS.map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 800 }}>
              {label} <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
