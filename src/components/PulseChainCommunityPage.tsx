import { BarChart2, BookOpen, Copy, ExternalLink, Check, Cpu, Layers, Shield, Zap, WalletCards, Route, Gem, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

type Project = {
  name: string;
  tag: string;
  url: string;
  color: string;
  desc: string;
  logo?: string;
};

type Lane = {
  title: string;
  kicker: string;
  icon: LucideIcon;
  color: string;
  items: Project[];
};

const TOKEN_LOGOS = {
  pls: 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
  plsx: 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png',
  inc: 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png',
  phex: 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
};

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

const NETWORK_SNAPSHOT = [
  { label: 'Chain ID', value: '369', detail: 'EVM compatible', icon: Cpu, color: 'var(--accent)' },
  { label: 'Native gas', value: 'PLS', detail: 'Gas and base unit', icon: Zap, color: 'var(--chain-pulse)' },
  { label: 'Block time', value: '~10s', detail: 'Proof of Stake', icon: Layers, color: '#627EEA' },
  { label: 'Asset rule', value: 'Verify', detail: 'Contracts and prices', icon: Shield, color: '#22d3ee' },
];

const OFFICIAL_PROJECTS: Project[] = [
  { name: 'HEX', tag: 'Staking', url: 'https://hex.com', color: '#a855f7', desc: 'Stake HEX for up to 5,555 days and earn T-share yield.', logo: TOKEN_LOGOS.phex },
  { name: 'PulseX', tag: 'Official DEX', url: 'https://app.pulsex.com', color: 'var(--accent)', desc: 'Swap PRC20 tokens, provide liquidity, and farm INC rewards.', logo: TOKEN_LOGOS.plsx },
  { name: 'PulseChain Bridge', tag: 'Bridge', url: 'https://bridge.pulsechain.com', color: '#627EEA', desc: 'Move assets between Ethereum and PulseChain.', logo: TOKEN_LOGOS.pls },
  { name: 'PulseChain Explorer', tag: 'Explorer', url: 'https://scan.pulsechain.com', color: '#06b6d4', desc: 'Inspect transactions, blocks, contracts, tokens, and wallets.' },
  { name: 'ProveX', tag: 'Settlement', url: 'https://provex.tech', color: '#a855f7', desc: 'Proof-based peer-to-peer settlement in the ecosystem.' },
  { name: 'Launchpad', tag: 'Validators', url: 'https://launchpad.pulsechain.com', color: '#a855f7', desc: 'Official validator setup and PLS validator staking.' },
];

const LANES: Lane[] = [
  {
    title: 'DEXs and Liquidity',
    kicker: 'Swap, farm, route',
    icon: Zap,
    color: 'var(--accent)',
    items: [
      { name: 'PulseX V1 / V2', tag: 'Official DEX', url: 'https://app.pulsex.com', color: 'var(--accent)', desc: 'Core swap, LP, and INC farming venue.', logo: TOKEN_LOGOS.plsx },
      { name: '9INCH / 9MM', tag: 'Concentrated LP', url: 'https://9inch.io', color: '#627EEA', desc: 'Uniswap V3-style concentrated liquidity.' },
      { name: 'PHUX', tag: 'Balancer Fork', url: 'https://phux.io', color: '#a855f7', desc: 'Weighted and multi-token pools.' },
      { name: 'LASO Finance', tag: 'Trading', url: 'https://laso.finance', color: '#06b6d4', desc: 'Advanced trading and liquidity tools.' },
    ],
  },
  {
    title: 'Bridges and Ramps',
    kicker: 'Move value carefully',
    icon: Route,
    color: '#627EEA',
    items: [
      { name: 'Official Bridge', tag: 'Ethereum route', url: 'https://bridge.pulsechain.com', color: '#627EEA', desc: 'Canonical Ethereum to PulseChain bridge route.' },
      { name: 'LibertySwap', tag: 'Privacy bridge', url: 'https://libertyswap.finance', color: '#a855f7', desc: 'Intent-based cross-chain swaps with privacy features.' },
      { name: 'Hyperlane', tag: 'Messaging', url: 'https://hyperlane.xyz', color: '#06b6d4', desc: 'Interoperability layer and warp routes.' },
      { name: '0xCoast', tag: 'Fiat ramp', url: 'https://0xcoast.com', color: '#22d3ee', desc: 'Fiat on/off ramp and CST stablecoin route.' },
    ],
  },
  {
    title: 'Analytics and Discovery',
    kicker: 'Charts, stats, lists',
    icon: BarChart2,
    color: '#22d3ee',
    items: [
      { name: 'PulseChainStats', tag: 'Analytics', url: 'https://pulsechainstats.com', color: 'var(--accent)', desc: 'Token intel, bridge stats, validators, and DEX volume.' },
      { name: 'DexScreener', tag: 'Charts', url: 'https://dexscreener.com/pulsechain', color: '#22d3ee', desc: 'Pair charts, liquidity, volume, and token search.' },
      { name: 'PulseCoinList', tag: 'Directory', url: 'https://pulsecoinlist.com', color: 'var(--chain-pulse)', desc: 'Broad project directory and discovery map.' },
      { name: 'PLSFolio', tag: 'Portfolio', url: 'https://plsfolio.com/ecosystem/', color: '#627EEA', desc: 'Portfolio-oriented ecosystem resources.' },
    ],
  },
  {
    title: 'Wallets, NFTs, and Tools',
    kicker: 'Access layer',
    icon: WalletCards,
    color: '#a855f7',
    items: [
      { name: 'Rabby Wallet', tag: 'Wallet', url: 'https://rabby.io', color: '#627EEA', desc: 'Multi-chain EVM wallet with transaction previews.' },
      { name: 'MetaMask', tag: 'Wallet', url: 'https://metamask.io', color: '#a855f7', desc: 'Common EVM wallet with custom network support.' },
      { name: 'Mintra', tag: 'NFT market', url: 'https://mintra.ai', color: 'var(--accent)', desc: 'PulseChain NFT marketplace.' },
      { name: 'NOWnodes', tag: 'RPC', url: 'https://nownodes.io', color: '#22d3ee', desc: 'Node and RPC infrastructure.' },
    ],
  },
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
      className="pce-copy"
      aria-label={`Copy ${text}`}
    >
      {copied ? <Check size={13} color="var(--accent)" /> : <Copy size={13} />}
    </button>
  );
}

function EcosystemMap() {
  const nodes = [
    { label: 'DEX', icon: Zap, color: 'var(--accent)', style: { left: '8%', top: '18%' } },
    { label: 'Bridge', icon: Route, color: '#627EEA', style: { right: '5%', top: '20%' } },
    { label: 'HEX', icon: Gem, color: '#a855f7', style: { left: '14%', bottom: '14%' } },
    { label: 'Stats', icon: BarChart2, color: '#22d3ee', style: { right: '13%', bottom: '12%' } },
  ];

  return (
    <div className="pce-map" aria-hidden="true">
      <div className="pce-map-ring" />
      <div className="pce-map-core">
        <img src={TOKEN_LOGOS.pls} alt="" />
        <strong>369</strong>
        <span>PulseChain</span>
      </div>
      {nodes.map(({ label, icon: Icon, color, style }) => (
        <div key={label} className="pce-map-node" style={{ ...style, ['--node-color' as string]: color }}>
          <Icon size={16} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function NetworkSnapshot() {
  return (
    <section className="pce-network-snapshot">
      <div className="pce-network-copy">
        <span className="pce-eyebrow">Network reference</span>
        <h2>PulseChain quick setup.</h2>
        <p>
          Chain 369 uses PLS for gas. Keep bridge tokens, fork copies, and native assets separated before signing.
        </p>
        <div className="pce-mini-links">
          {QUICK_LINKS.slice(0, 4).map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {label} <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </div>
      <div className="pce-snapshot-grid">
        {NETWORK_SNAPSHOT.map(({ label, value, detail, icon: Icon, color }) => (
          <div key={label} className="pce-fact" style={{ ['--fact-color' as string]: color }}>
            <Icon size={18} />
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ item }: { item: Project }) {
  return (
    <details className="pce-project-card" style={{ ['--project-color' as string]: item.color }}>
      <summary className="pce-project-summary">
        <span className="pce-project-logo">
          {item.logo ? <img src={item.logo} alt="" /> : item.name.slice(0, 1)}
        </span>
        <span className="pce-project-body">
          <span className="pce-project-top">
            <strong>{item.name}</strong>
            <span className="pce-project-caret" aria-hidden="true">{'>'}</span>
          </span>
          <small>{item.tag}</small>
        </span>
      </summary>
      <div className="pce-project-detail">
        <em>{item.desc}</em>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          Open {item.name} <ExternalLink size={12} />
        </a>
      </div>
    </details>
  );
}

function LaneSection({ lane }: { lane: Lane }) {
  const Icon = lane.icon;
  return (
    <details className="pce-lane pce-section-dropdown" style={{ ['--lane-color' as string]: lane.color }} open>
      <summary className="pce-section-summary pce-lane-head">
        <span><Icon size={18} /></span>
        <div>
          <small>{lane.kicker}</small>
          <h2>{lane.title}</h2>
        </div>
        <b className="pce-section-caret" aria-hidden="true">{'>'}</b>
      </summary>
      <div className="pce-project-grid">
        {lane.items.map(item => (
          <div key={item.name}>
            <ProjectCard item={item} />
          </div>
        ))}
      </div>
    </details>
  );
}

function InfoDropdown() {
  return (
    <details className="pce-info-dropdown">
      <summary>
        <span>
          <BookOpen size={18} />
          PulseChain setup, safety notes, and official links
        </span>
        <small>Open info</small>
      </summary>
      <div className="pce-info-body">
        <section className="pce-info-panel">
          <div className="pce-section-intro">
            <span>Network settings</span>
            <h2>Wallet setup reference.</h2>
          </div>
          <div className="pce-network-list">
            {NETWORK_ROWS.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <code>{value}</code>
                <CopyButton text={value} />
              </div>
            ))}
          </div>
          <div className="pce-link-row">
            {QUICK_LINKS.map(([label, url]) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                {label} <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </section>

        <section className="pce-info-panel">
          <div className="pce-section-intro">
            <span>Safety notes</span>
            <h2>Verify the route before you sign.</h2>
          </div>
          <div className="pce-note-list">
            <p>PulseChain tokens are separate from Ethereum tokens even when addresses match.</p>
            <p>Bridged stablecoins such as pDAI, pUSDC, and pUSDT are market-priced. Do not assume $1.</p>
            <p>Verify chain ID 369 before signing transactions or adding custom RPC endpoints.</p>
          </div>
        </section>
      </div>
    </details>
  );
}

export default function PulseChainCommunityPage() {
  return (
    <div className="pce-page">
      <section className="pce-hero">
        <div className="pce-hero-copy">
          <span className="pce-eyebrow">Map and reference</span>
          <h1>PulseChain Ecosystem</h1>
          <p>
            A clean map of core tokens, official routes, DEX liquidity, bridge paths, analytics, wallets, and tools.
          </p>
          <div className="pce-hero-actions">
            <a href="https://app.pulsex.com" target="_blank" rel="noopener noreferrer">Open PulseX <ExternalLink size={13} /></a>
            <a href="https://scan.pulsechain.com" target="_blank" rel="noopener noreferrer">Open Explorer <ExternalLink size={13} /></a>
          </div>
        </div>
        <EcosystemMap />
      </section>

      <NetworkSnapshot />

      <InfoDropdown />

      <details className="pce-featured pce-section-dropdown" open>
        <summary className="pce-section-summary">
          <div className="pce-section-intro">
            <span>Official routes</span>
            <h2>Start with the main rails.</h2>
          </div>
          <b className="pce-section-caret" aria-hidden="true">{'>'}</b>
        </summary>
        <div className="pce-official-grid">
          {OFFICIAL_PROJECTS.map(item => (
            <div key={item.name}>
              <ProjectCard item={item} />
            </div>
          ))}
        </div>
      </details>

      <div className="pce-lanes">
        {LANES.map(lane => (
          <div key={lane.title}>
            <LaneSection lane={lane} />
          </div>
        ))}
      </div>
    </div>
  );
}
