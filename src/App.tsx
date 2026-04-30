import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Wallet as WalletIcon,
  Coins,
  Lock,
  TrendingUp,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  RefreshCcw,
  PieChart as PieChartIcon,
  Activity,
  Layers,
  ChevronRight,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  History,
  Filter,
  Download,
  LayoutDashboard,
  ArrowLeftRight,
  Settings,
  Eye,
  EyeOff,
  Calculator,
  X,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  Pencil,
  Check,
  KeyRound,
  Zap,
  BarChart2,
  Droplets,
  Shield,
  Menu
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import PulseChainCommunityPage from './components/PulseChainCommunityPage';
import BridgeDashboardPage from './components/BridgeDashboardPage';
import { format } from 'date-fns';
import { createPublicClient, http, getAddress } from 'viem';
import { cn } from './lib/utils';
import { CHAINS, HEX_ABI, TOKENS, PULSEX_LP_PAIRS, PHEX_YIELD_PER_TSHARE, EHEX_YIELD_PER_TSHARE, PHEX_YIELD_BI_NUM, PHEX_YIELD_BI_DEN, EHEX_YIELD_BI_NUM, EHEX_YIELD_BI_DEN, FALLBACK_DESCRIPTIONS } from './constants';
import type { Asset, Wallet, Chain, HexStake, LpPosition, FarmPosition, HistoryPoint, Transaction } from './types';
import { LiquidityOverviewStrip, LiquiditySection } from './components/LiquiditySection';
import { PnLModal } from './components/PnLModal';
import { ProfitPlannerModal } from './components/ProfitPlannerModal';
import { StakesSection } from './components/StakesSection';
import { TokenCardModal } from './components/TokenCardModal';
import { MarketWatchModal } from './components/MarketWatchModal';
import { TransactionList } from './components/TransactionList';
import { HoldingsTable } from './components/HoldingsTable';
import type { HoldingDisplayAsset, HoldingSortField } from './components/HoldingsTable';
import { CoinList, type CoinListItem } from './components/CoinList';
import { PulseBoardFeed } from './components/PulseBoardFeed';
import { normalizeTransactions } from './utils/normalizeTransactions';
import { buildInvestmentRows } from './utils/buildInvestmentRows';
import { scheduleLocalStorageWrite, resolveBlockscoutBase } from './utils/localStorageDebounce';
import { dataAccess } from './services/dataAccess';
import {
  fetchBlockscoutTokenDetails,
  fetchDefiLlamaPrices,
  fetchDexScreenerSummary,
} from './services/marketDataService';
import { buildTransactionExportRows, buildTransactionExportJson } from './utils/transactionExport';
import { BRAND_ASSETS } from './branding/brand-assets';
import {
  ACTIVE_TAB_STORAGE_KEY,
  buildAppShellController,
  readStoredActiveTab,
  type ActiveTab,
} from './features/app-shell/appShellController';
import type { HistoryDrilldownIntent } from './features/history/historyDrilldown';
import { useHistoryController } from './features/history/useHistoryController';
import { buildPortfolioSnapshot } from './features/portfolio/buildPortfolioSnapshot';
import { createPortfolioFetchController } from './features/portfolio/createPortfolioFetchController';
import { enrichPulsechainMissingPrices } from './features/portfolio/enrichPulsechainMissingPrices';
import { loadHexStakes } from './features/portfolio/loadHexStakes';
import { loadPulsechainFarmPositions, loadPulsechainLpPositions } from './features/portfolio/loadPulsechainLiquidity';
import { loadWalletChainData } from './features/portfolio/loadWalletChainData';
import { usePortfolioSummaryController } from './features/portfolio/usePortfolioSummaryController';
import { buildWalletAnalyzerPageProps } from './features/wallet-analyzer/buildWalletAnalyzerPageProps';
import { MyInvestmentsPage } from './pages/MyInvestmentsPage';
import { WalletAnalyzerPage } from './pages/WalletAnalyzer';
import { buildWalletAnalyzerModel } from './utils/buildWalletAnalyzerModel';
import { MyInvestmentsUtilityStrip } from './components/my-investments/MyInvestmentsUtilityStrip';

const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  }
] as const;

const PriceDisplay = ({ price, className }: { price: number, className?: string }) => {
  if (price === 0) return <span className={className}>$0.00</span>;

  // Handle very small prices with subscript for zeros
  if (price < 0.0001 && price > 0) {
    const priceStr = price.toFixed(12);
    const match = priceStr.match(/^0\.0+(?=[1-9])/);
    if (match) {
      const zerosCount = match[0].length - 2;
      const remaining = priceStr.slice(match[0].length);
      return (
        <span className={cn("font-mono", className)}>
          $0.0<sub className="price-sub">{zerosCount}</sub>{remaining.slice(0, 4)}
        </span>
      );
    }
  }

  return (
    <span className={cn("font-mono", className)}>
      ${price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: price < 1 ? 6 : 2
      })}
    </span>
  );
};

// -- localStorage cache helpers (BigInt-safe) ----------------------------------
const bigIntReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? `__bi__${value.toString()}` : value;
const bigIntReviver = (_key: string, value: unknown) =>
  typeof value === 'string' && value.startsWith('__bi__')
    ? BigInt(value.slice(6))
    : value;

function tryReadCache<T>(key: string, withBigInt = false): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return withBigInt ? JSON.parse(raw, bigIntReviver) : JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStoredJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isNoContractDataError(error: unknown): boolean {
  const err = error as { shortMessage?: string; message?: string; details?: string; name?: string; cause?: unknown };
  const cause = err?.cause as { shortMessage?: string; message?: string; details?: string; name?: string } | undefined;
  const text = [
    err?.name,
    err?.shortMessage,
    err?.message,
    err?.details,
    cause?.name,
    cause?.shortMessage,
    cause?.message,
    cause?.details,
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes('returned no data')
    || text.includes('contractfunctionzerodataerror')
    || text.includes('abidecodingzerodataerror')
    || text.includes('function may not exist');
}

// -- StakingLadder -------------------------------------------------------------
// Bar chart showing stake distribution by 30-day end-date buckets (from pulsechain-dashboard)
function StakingLadder({ stakes }: { stakes: HexStake[] }) {
  if (!stakes || stakes.length === 0) return null;
  const bucketSize = 30;
  const buckets: Record<number, { totalShares: number; stakeCount: number; bucketRange: string }> = {};

  stakes.forEach(stake => {
    const days = Math.max(0, Math.min(5555, Math.floor(stake.daysRemaining ?? 0)));
    const bucketIdx = Math.floor(days / bucketSize);
    if (!buckets[bucketIdx]) {
      const start = bucketIdx * bucketSize;
      buckets[bucketIdx] = { totalShares: 0.001, stakeCount: 0, bucketRange: `${start}-${start + bucketSize - 1}` };
    }
    buckets[bucketIdx].totalShares = (buckets[bucketIdx].totalShares === 0.001 ? 0 : buckets[bucketIdx].totalShares) + (stake.tShares ?? 0);
    buckets[bucketIdx].stakeCount += 1;
  });

  const chartData = Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([idx, d]) => ({ daysRemaining: Number(idx) * bucketSize + bucketSize / 2, ...d }));

  const CustomTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="chart-tooltip" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>Days: {d.bucketRange}</div>
        <div>T-Shares: {d.totalShares.toFixed(2)}</div>
        <div>Stakes: {d.stakeCount}</div>
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 18px 10px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Staking Ladder</div>
      <ResponsiveContainer width="100%" height={220} minWidth={1} minHeight={1}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="daysRemaining" tick={{ fill: 'var(--fg-subtle)', fontSize: 13 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false}
            label={{ value: 'Days Remaining', position: 'insideBottom', offset: -10, fill: 'var(--fg-subtle)', fontSize: 13 }} />
          <YAxis tick={{ fill: 'var(--fg-subtle)', fontSize: 13 }} axisLine={false} tickLine={false} scale="log" domain={['auto', 'auto']} allowDataOverflow={false} />
          <RechartsTooltip content={<CustomTip />} />
          <Bar dataKey="totalShares" fill="#00FF9F" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -- StakingPie -----------------------------------------------------------------
// Donut chart showing HEX stake distribution grouped by wallet (from pulsechain-dashboard)
function StakingPie({ stakes, hexUsdPrice }: { stakes: HexStake[]; hexUsdPrice: number }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  if (!stakes || stakes.length === 0) return null;

  const byWallet: Record<string, { label: string; tShares: number; stakedHex: number; yieldHex: number; totalHex: number; totalUsd: number; count: number }> = {};
  stakes.forEach(s => {
    const key = s.walletAddress ?? s.id;
    const label = s.walletLabel ?? key.slice(0, 8) + '...';
    if (!byWallet[key]) byWallet[key] = { label, tShares: 0, stakedHex: 0, yieldHex: 0, totalHex: 0, totalUsd: 0, count: 0 };
    const tsh = s.tShares ?? 0;
    const staked = s.stakedHex ?? 0;
    const yld = s.stakeHexYield ?? 0;
    byWallet[key].tShares += tsh;
    byWallet[key].stakedHex += staked;
    byWallet[key].yieldHex += yld;
    byWallet[key].totalHex += staked + yld;
    byWallet[key].totalUsd += (staked + yld) * hexUsdPrice;
    byWallet[key].count += 1;
  });

  const totalTShares = Object.values(byWallet).reduce((a, b) => a + b.tShares, 0);
  const totalUsd = Object.values(byWallet).reduce((a, b) => a + b.totalUsd, 0);
  const totalHex = Object.values(byWallet).reduce((a, b) => a + b.totalHex, 0);

  const sorted = Object.values(byWallet).sort((a, b) => b.tShares - a.tShares);
  const threshold = 0.02;
  const large = sorted.filter(w => w.tShares / totalTShares >= threshold);
  const small = sorted.filter(w => w.tShares / totalTShares < threshold);
  const chartData = small.length > 0
    ? [...large, { label: 'Others', tShares: small.reduce((a, b) => a + b.tShares, 0), totalUsd: small.reduce((a, b) => a + b.totalUsd, 0), count: small.reduce((a, b) => a + b.count, 0) }]
    : large;

  const GRADIENT = ['#00FF9F', '#627EEA', '#f739ff', '#fb923c', '#3b82f6', '#a855f7'];
  const getColor = (i: number) => GRADIENT[i % GRADIENT.length];

  const fmtK = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(0);

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
      <g>
        <text x={cx} y={cy - 14} textAnchor="middle" fill="var(--fg-subtle)" fontSize="12">{payload.label}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--fg)" fontSize="18" fontWeight="700">{fmtK(payload.tShares)}</text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="var(--fg-subtle)" fontSize="11">T-Shares</text>
        <Pie data={[]} cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} dataKey="value" />
      </g>
    );
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 18px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Stake Distribution</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          <span style={{ color: 'var(--fg)', fontWeight: 700 }}>${fmtK(totalUsd)}</span>
          {'  -  '}<span style={{ color: '#fb923c' }}>{fmtK(totalHex)} HEX</span>
          {'  -  '}<span style={{ color: 'var(--accent)' }}>{fmtK(totalTShares)} T-Shares</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={1}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="tShares"
            activeIndex={activeIndex} activeShape={renderActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}>
            {chartData.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
          </Pie>
          <RechartsTooltip formatter={(val: any, _: any, entry: any) => [`${fmtK(Number(val))} T-Shares  -  $${fmtK(entry.payload.totalUsd)}`, entry.payload.label]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 4 }}>
        {chartData.map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: getColor(i), flexShrink: 0 }} />
            <span>{w.label}</span>
            <span style={{ color: 'var(--fg-subtle)' }}>({w.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Wallet Selector ---------------------------------------------------------
function shortenAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface WalletSelectorProps {
  wallets: string[];
  activeWallet: string | null;
  onSelect: (addr: string | null) => void;
  onAdd: () => void;
  onRemove?: (addr: string) => void;
  walletLabels?: Record<string, string>;
}

const WALLET_DOT_COLORS = ['#00FF9F','#f739ff','#627EEA','#f97316','#a855f7','#f59e0b','#06b6d4','#ec4899'];

function WalletSelector({ wallets, activeWallet, onSelect, onAdd, onRemove, walletLabels = {} }: WalletSelectorProps) {
  if (wallets.length === 0) {
    return (
      <button onClick={onAdd} className="btn-ghost" style={{ fontSize: 12, gap: 6 }}>
        <span style={{ fontSize: 14 }}>+</span> Add Wallet
      </button>
    );
  }
  return (
    <div className="wallet-selector-bar">
      <button className={`wallet-pill${activeWallet === null ? ' active' : ''}`} onClick={() => onSelect(null)}>
        <span className="wallet-dot wallet-dot-multi" />
        All
      </button>
      {wallets.map((addr, idx) => {
        const label = walletLabels[addr] ?? shortenAddr(addr);
        const dotColor = WALLET_DOT_COLORS[idx % WALLET_DOT_COLORS.length];
        const isActive = activeWallet === addr;
        return (
          <span
            key={addr}
            className={`wallet-pill${isActive ? ' active' : ''}`}
            title={addr}
            style={isActive ? {
              background: `${dotColor}1a`,
              borderColor: `${dotColor}55`,
              color: dotColor,
            } : undefined}
          >
            <span
              onClick={() => onSelect(addr)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <span className="wallet-dot" style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}bb` }} />
              {label}
            </span>
            {onRemove && (
              <button
                className="wallet-pill-x"
                onClick={e => { e.stopPropagation(); onRemove(addr); }}
                title={`Remove ${label}`}
                aria-label={`Remove ${label}`}
              >
                x
              </button>
            )}
          </span>
        );
      })}
      <button
        className="wallet-pill-add"
        onClick={onAdd}
        title="Add wallet"
        aria-label="Add wallet"
      >
        +
      </button>
    </div>
  );
}

// -- Module-level logo overrides - these always win over CoinGecko / DexScreener -
// Keyed by lowercase contract address on PulseChain.
// Nothing may ever overwrite these entries in tokenLogos or asset.logoUrl.
const STATIC_LOGOS: Record<string, string> = {
  '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d': 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png', // INC
  '0xf6f8db0aba00007681f8faf16a0fda1c9b030b11': 'https://cdn.dexscreener.com/cms/images/ODHYYN7yppDHnd6u?width=64&height=64&fit=crop&quality=95&format=auto', // PRVX
  '0xe33a5ae21f93acec5cfc0b7b0fdbb65a0f0be5cc': 'https://tokens.app.pulsex.com/images/tokens/0xE33A5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC.png', // MOST
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png', // pDAI (bridged DAI) - never use golden CoinGecko DAI coin here
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'https://tokens.app.pulsex.com/images/tokens/0x6B175474E89094C44Da98b954EedeAC495271d0F.png', // pDAI system copy (fork of Ethereum DAI) - prevents CoinGecko golden-coin from replacing this on reload
};

// Bridged HEX (eHEX) on PulseChain - no on-chain WPLS LP, falls back to CoinGecko 'hex'
const EHEX_PULSECHAIN_ADDR = '0x57fde0a71132198bbec939b98976993d8d89d225';
const ETH_HEX_ADDR = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';

const normalizeAssetSymbol = (symbol: string, chain?: string): string => {
  const upper = (symbol || '').toUpperCase();
  return chain === 'pulsechain' && upper === 'WPLS' ? 'PLS' : upper;
};

const sameAssetSymbol = (left: string, right: string, chain?: string): boolean =>
  normalizeAssetSymbol(left, chain) === normalizeAssetSymbol(right, chain);

// Below this threshold (USD) we consider netInvestment effectively zero and hide the P&L %.
// PulseChain-only wallets have no ETH/stable inflows so netInvestment stays near 0.
const MIN_INVESTMENT_THRESHOLD = 100;

// Liberty Swap cross-chain bridge detection
type FrontMarketPeriod = '5m' | '1h' | '6h' | '24h' | '7d';
const FRONT_MARKET_PERIODS: FrontMarketPeriod[] = ['5m', '1h', '6h', '24h', '7d'];

export default function App() {
  // -- Formatting helpers (defined once here, used throughout) ----------------
  const fmtBigNum = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
  const fmtDec = (n: number, dp = 2) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtTok = (n: number) => n > 1e6 ? `${(n/1e6).toFixed(2)}M` : n > 1000 ? `${(n/1000).toFixed(2)}K` : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const fmtCompact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  // -- CSV Export helper ------------------------------------------------------
  const exportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escCell = (c: string | number) => {
      const s = String(c);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [headers, ...rows].map(r => r.map(escCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const [wallets, setWallets] = useState<Wallet[]>(() => {
    return readStoredJSON<Wallet[]>('pulseport_wallets', []);
  });
  const [realAssets, setRealAssets] = useState<Asset[]>(() => tryReadCache<Asset[]>('pulseport_cache_assets') ?? []);
  const [realStakes, setRealStakes] = useState<HexStake[]>(() => tryReadCache<HexStake[]>('pulseport_cache_stakes', true) ?? []);
  const [lpPositions, setLpPositions] = useState<LpPosition[]>(() => tryReadCache<LpPosition[]>('pulseport_cache_lp') ?? []);
  const [farmPositions, setFarmPositions] = useState<FarmPosition[]>(() => tryReadCache<FarmPosition[]>('pulseport_cache_farms') ?? []);
  const [transactions, setTransactions] = useState<Transaction[]>(() => tryReadCache<Transaction[]>('pulseport_cache_txs') ?? []);
  const [history, setHistory] = useState<HistoryPoint[]>(() => readStoredJSON<HistoryPoint[]>('pulseport_history', []));
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletName, setNewWalletName] = useState('');
  const [walletFormError, setWalletFormError] = useState('');
  const [isAddingWallet, setIsAddingWallet] = useState(false);
  const [editingWalletAddress, setEditingWalletAddress] = useState<string | null>(null);
  const [editWalletName, setEditWalletName] = useState('');
  const [isCustomCoinsModalOpen, setIsCustomCoinsModalOpen] = useState(false);
  const [customCoins, setCustomCoins] = useState<any[]>(() => readStoredJSON<any[]>('custom_coins', []));
  const [customCoinDraft, setCustomCoinDraft] = useState({ symbol: '', name: '', balance: '', price: '' });

  useEffect(() => {
    localStorage.setItem('custom_coins', JSON.stringify(customCoins));
  }, [customCoins]);

  const addCustomCoin = (coin: any) => {
    setCustomCoins([...customCoins, { ...coin, id: Math.random().toString(36).substr(2, 9) }]);
  };

  const removeCustomCoin = (id: string) => {
    setCustomCoins(customCoins.filter(c => c.id !== id));
  };

  const submitCustomCoin = () => {
    const symbol = customCoinDraft.symbol.trim().toUpperCase();
    const name = customCoinDraft.name.trim() || symbol;
    const balance = Number(customCoinDraft.balance);
    const price = Number(customCoinDraft.price || 0);
    if (!symbol || !Number.isFinite(balance) || balance <= 0 || !Number.isFinite(price) || price < 0) return;
    addCustomCoin({ symbol, name, balance, price });
    setCustomCoinDraft({ symbol: '', name: '', balance: '', price: '' });
    setIsCustomCoinsModalOpen(false);
    setActiveTab('overview');
  };
  const [sidebarWalletsOpen, setSidebarWalletsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(readStoredActiveTab);
  const [selectedWalletAddr, setSelectedWalletAddr] = useState<string>('all');
  const [walletAssets, setWalletAssets] = useState<Record<string, Asset[]>>(() => tryReadCache<Record<string, Asset[]>>('pulseport_cache_wallet_assets') ?? {});
  const [walletChainFilter, setWalletChainFilter] = useState<'all' | 'pulsechain' | 'ethereum' | 'base'>('all');
  const [overviewChainFilter, setOverviewChainFilter] = useState<'all' | 'pulsechain' | 'ethereum' | 'base'>('all');
  const [overviewTokenSearch, setOverviewTokenSearch] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [historyRange, setHistoryRange] = useState<'1D' | '1W' | '1M'>('1M');
  const [viewAsYou, setViewAsYou] = useState(false);
  const [txCompact, setTxCompact] = useState(false);
  const [receivedCoinFilter, setReceivedCoinFilter] = useState<string>('all');
  const [receivedChainFilter, setReceivedChainFilter] = useState<string>('all');
  const [timeSinceLastUpdate, setTimeSinceLastUpdate] = useState<number>(0);
  const [manualEntries, setManualEntries] = useState<Record<string, number>>(() => readStoredJSON<Record<string, number>>('pulseport_manual_entries', {}));
  const [prices, setPrices] = useState<Record<string, any>>(() => tryReadCache<Record<string, any>>('pulseport_cache_prices') ?? {});
  const [etherscanApiKey, setEtherscanApiKey] = useState<string>(() => localStorage.getItem('pulseport_etherscan_key') || '');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hideDust, setHideDust] = useState<boolean>(() => readStoredJSON<boolean>('pulseport_hide_dust', false));
  const [hiddenTokens, setHiddenTokens] = useState<string[]>(() => {
    return readStoredJSON<string[]>('pulseport_hidden_tokens', []);
  });
  const [showHiddenCoins, setShowHiddenCoins] = useState(false);
  const [coinVisibilityMenuOpen, setCoinVisibilityMenuOpen] = useState(false);
  const [frontMarketPeriod, setFrontMarketPeriod] = useState<FrontMarketPeriod>('24h');
  const [priceChangePeriod, setPriceChangePeriod] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [assetSortField, setAssetSortField] = useState<'value' | 'change'>('value');
  const [assetSortDir, setAssetSortDir] = useState<'desc' | 'asc'>('desc');
  // tokenLogos is seeded from the module-level STATIC_LOGOS map so overrides are
  // available before any remote fetch completes.
  const [tokenLogos, setTokenLogos] = useState<Record<string, string>>(STATIC_LOGOS);
  const [stakeChainFilter, setStakeChainFilter] = useState<'all' | 'pulsechain' | 'ethereum'>('all');
  const [yieldUnit, setYieldUnit] = useState<'hex' | 'usd'>(() => {
    return (localStorage.getItem('pulseport_yield_unit') as 'hex' | 'usd') || 'usd';
  });
  const [expandedStakeIds, setExpandedStakeIds] = useState<Set<string>>(new Set());
  const [expandedAssetIds, setExpandedAssetIds] = useState<Set<string>>(new Set());
  const [priceDisplayCurrency, setPriceDisplayCurrency] = useState<'usd' | 'pls'>('usd');
  const [pnlAsset, setPnlAsset] = useState<Asset | null>(null);
  const [selectedBridgeTxId, setSelectedBridgeTxId] = useState<string | null>(null);
  const [profitPlannerOpen, setProfitPlannerOpen] = useState(false);
  const [allocWheelOpen, setAllocWheelOpen] = useState(true);
  const [allocationCalculatorOpen, setAllocationCalculatorOpen] = useState(false);
  const [allocationDraftPercentages, setAllocationDraftPercentages] = useState<Record<string, number>>({});
  const [perfPeriod, setPerfPeriod] = useState<'1w' | '1m' | '1y' | 'all'>('all');
  const fmtLabel = (ts: number) => {
    if (perfPeriod === '1w') return format(ts, 'EEE d');
    if (perfPeriod === '1m') return format(ts, 'MMM d');
    if (perfPeriod === '1y') return format(ts, 'MMM yy');
    return format(ts, 'MMM yy');
  };
  const [hiddenTxIds, setHiddenTxIds] = useState<string[]>(() => {
    return readStoredJSON<string[]>('pulseport_hidden_txs', []);
  });
  const [showHiddenTxs, setShowHiddenTxs] = useState(false);
  const [showReceivedAssets, setShowReceivedAssets] = useState(true);
  const [showRecentActivity, setShowRecentActivity] = useState(true);
  const [hideSpam, setHideSpam] = useState<boolean>(() => readStoredJSON<boolean>('pulseport_hide_spam', true));
  const [spamTokenIds, setSpamTokenIds] = useState<string[]>(() => {
    return readStoredJSON<string[]>('pulseport_spam_tokens', []);
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => readStoredJSON<Record<string, boolean>>('pulseport_collapsed', {}));
  const [tokenMarketData, setTokenMarketData] = useState<Record<string, any>>({});
  const [tokenCardModal, setTokenCardModal] = useState<Asset | null>(null);
  const [tokenCardModalLoading, setTokenCardModalLoading] = useState(false);
  const [showMarketWatch, setShowMarketWatch] = useState(false);
  const [marketWatchInitialSearch, setMarketWatchInitialSearch] = useState('');
  const [homeSearch, setHomeSearch] = useState('');
  const [expandedWalletAssetIds, setExpandedWalletAssetIds] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('pulseport_theme');
    return (saved === 'light') ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedWalletAddr === 'all') return;
    const stillExists = wallets.some(w => w.address.toLowerCase() === selectedWalletAddr);
    if (!stillExists) {
      setSelectedWalletAddr('all');
      setActiveWallet(null);
    }
  }, [selectedWalletAddr, wallets]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pulseport_theme', theme);
  }, [theme]);

  // Prevent background scroll when the mobile sidebar drawer is open.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;

    const previousOverflow = document.body.style.overflow;
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow || '';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [activeTab]);

  // Theme-aware color helpers - CSS variable-backed for automatic light/dark theming
  const t = useMemo(() => ({
    surface: 'var(--bg-void)',
    card: 'var(--bg-surface)',
    cardHigh: 'var(--bg-elevated)',
    cardHighest: 'var(--bg-elevated)',
    border: 'var(--border)',
    borderLight: 'var(--border)',
    text: 'var(--fg)',
    textSecondary: 'var(--fg-muted)',    /* labels, prices, percent values - strong contrast */
    textMuted: 'var(--fg-subtle)',       /* icons and separators - strong contrast */
    textTertiary: 'var(--fg-subtle)',    /* helper text - strong contrast */
    sidebar: 'var(--bg-sidebar)',
    header: 'var(--bg-header)',
    hoverBg: 'var(--bg-elevated)',
    expandedBg: 'var(--bg-elevated)',
    green: theme === 'dark' ? '#00FF9F' : '#059669',
    red: theme === 'dark' ? '#f43f5e' : '#dc2626',
    purple: '#8b5cf6',
    orange: '#f97316',
    blue: 'var(--chain-eth)',
    pink: 'var(--chain-pulse)',
    gradientHero: theme === 'dark'
      ? 'linear-gradient(135deg, #0b1a12 0%, #08100e 40%, #080d16 100%)'
      : 'linear-gradient(135deg, #eef8f4 0%, #f5f5f5 40%, #eef0fa 100%)',
  }), [theme]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_collapsed', JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  const toggleSection = (id: string) => setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  const isCollapsed = (id: string) => !!collapsedSections[id];

  // -- Portfolio cache persistence (prevents blank screen on reload) ----------
  // Writes are debounced (500ms) so rapid price/asset updates don't block the main thread
  // with large JSON.stringify + localStorage.setItem calls on every tick.
  useEffect(() => {
    if (realAssets.length > 0) {
      scheduleLocalStorageWrite('pulseport_cache_assets', JSON.stringify(realAssets));
    }
  }, [realAssets]);

  useEffect(() => {
    if (realStakes.length > 0) {
      scheduleLocalStorageWrite('pulseport_cache_stakes', JSON.stringify(realStakes, bigIntReplacer));
    }
  }, [realStakes]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_cache_lp', JSON.stringify(lpPositions));
  }, [lpPositions]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_cache_farms', JSON.stringify(farmPositions));
  }, [farmPositions]);

  useEffect(() => {
    if (transactions.length > 0) {
      scheduleLocalStorageWrite('pulseport_cache_txs', JSON.stringify(transactions.slice(0, 200)));
    }
  }, [transactions]);

  useEffect(() => {
    if (Object.keys(walletAssets).length > 0) {
      scheduleLocalStorageWrite('pulseport_cache_wallet_assets', JSON.stringify(walletAssets));
    }
  }, [walletAssets]);

  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      scheduleLocalStorageWrite('pulseport_cache_prices', JSON.stringify(prices));
    }
  }, [prices]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_hide_dust', JSON.stringify(hideDust));
  }, [hideDust]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_hide_spam', JSON.stringify(hideSpam));
  }, [hideSpam]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_spam_tokens', JSON.stringify(spamTokenIds));
  }, [spamTokenIds]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_hidden_tokens', JSON.stringify(hiddenTokens));
  }, [hiddenTokens]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_hidden_txs', JSON.stringify(hiddenTxIds));
  }, [hiddenTxIds]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_yield_unit', yieldUnit);
  }, [yieldUnit]);

  useEffect(() => {
    scheduleLocalStorageWrite('pulseport_manual_entries', JSON.stringify(manualEntries));
  }, [manualEntries]);

  useEffect(() => {
    if (wallets.length > 0) {
      fetchPortfolio();

      // Auto-refresh every 30 seconds
      const interval = setInterval(() => {
        fetchPortfolio();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [wallets]);

  useEffect(() => {
    try {
      localStorage.setItem('pulseport_wallets', JSON.stringify(wallets));
    } catch {}
  }, [wallets]);

  useEffect(() => {
    if (isAddingWallet) setWalletFormError('');
  }, [isAddingWallet]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated) {
        setTimeSinceLastUpdate(Math.floor((Date.now() - lastUpdated) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  useEffect(() => {
    localStorage.setItem('pulseport_history', JSON.stringify(history));
  }, [history]);

  const fetchPortfolio = createPortfolioFetchController({
    wallets,
    prices,
    history,
    realStakes,
    etherscanApiKey,
    isFetchingRef,
    setIsLoading,
    setTokenLogos,
    setPrices,
    setSpamTokenIds,
    setRealAssets,
    setRealStakes,
    setWalletAssets,
    setLpPositions,
    setFarmPositions,
    setTransactions,
    setLastUpdated,
    setHistory,
    staticLogos: STATIC_LOGOS,
    ethHexAddress: ETH_HEX_ADDR,
    ehexPulsechainAddress: EHEX_PULSECHAIN_ADDR,
    erc20Abi: ERC20_ABI,
    isNoContractDataError,
  });

  const addWallet = () => {
    const normalizedInput = newWalletAddress.trim();
    let checksummedAddress = '';

    try {
      checksummedAddress = getAddress(normalizedInput);
    } catch {
      setWalletFormError('Enter a valid EVM wallet address (0x...).');
      return;
    }

    // Prevent duplicate wallets
    if (wallets.some(w => w.address.toLowerCase() === checksummedAddress.toLowerCase())) {
      setWalletFormError('This wallet has already been added.');
      return;
    }

    const trimmedName = newWalletName.trim();
    const newWallet: Wallet = {
      address: checksummedAddress,
      name: trimmedName || `Wallet ${wallets.length + 1}`
    };
    setWallets([...wallets, newWallet]);
    setNewWalletAddress('');
    setNewWalletName('');
    setWalletFormError('');
    setIsAddingWallet(false);
  };

  const removeWallet = (address: string) => {
    setWallets(wallets.filter(w => w.address !== address));
  };

  const renameWallet = (address: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWallets(wallets.map(w => w.address === address ? { ...w, name: trimmed } : w));
    setEditingWalletAddress(null);
  };

  const scanForSpam = async () => {
    const baseAssets = wallets.length > 0 ? realAssets : [];
    const unpriced = baseAssets.filter(a => a.price === 0 && (a as any).address && (a as any).address !== 'native');
    if (unpriced.length === 0) { setScanResult(0); return; }
    setIsScanning(true);
    setScanResult(null);
    const newSpamIds: string[] = [...spamTokenIds];
    let detected = 0;

    // For Ethereum tokens use DeFi Llama (most comprehensive price coverage)
    const ethAssets = unpriced.filter(a => a.chain === 'ethereum');
    const otherAssets = unpriced.filter(a => a.chain !== 'ethereum');

    if (ethAssets.length > 0) {
      try {
        const keys = ethAssets.map(a => `ethereum:${(a as any).address.toLowerCase()}`);
        const data = await fetchDefiLlamaPrices(keys);
        ethAssets.forEach(asset => {
          const key = `ethereum:${(asset as any).address.toLowerCase()}`;
          const hasPrice = data[key]?.price != null;
          if (!hasPrice && !newSpamIds.includes(asset.id)) {
            newSpamIds.push(asset.id);
            detected++;
          }
        });
      } catch { /* ignore */ }
    }

    // For PulseChain/Base tokens use Blockscout
    await Promise.allSettled(otherAssets.map(async (asset) => {
      try {
        const addr = (asset as any).address;
        const chain = asset.chain === 'base' ? 'base' : 'pulsechain';
        const data = await fetchBlockscoutTokenDetails(chain, addr);
        if (!data) return;
        const hasMarket = data.exchange_rate || data.circulating_market_cap || data.volume_24h;
        if (!hasMarket && !newSpamIds.includes(asset.id)) {
          newSpamIds.push(asset.id);
          detected++;
        }
      } catch { /* ignore */ }
    }));

    setSpamTokenIds(newSpamIds);
    setIsScanning(false);
    setScanResult(detected);
  };

  const assetUniverse = useMemo(() => {
    const activeWalletKey = activeWallet?.toLowerCase() ?? null;
    const baseAssets = activeWalletKey ? (walletAssets[activeWalletKey] || []) : realAssets;
    const assetsWithCustom = [...baseAssets];

    customCoins.forEach(coin => {
      assetsWithCustom.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        balance: coin.balance,
        price: coin.price,
        value: coin.balance * coin.price,
        chain: 'custom' as any,
        pnl24h: 0
      });
    });

    return assetsWithCustom;
  }, [wallets.length, realAssets, walletAssets, activeWallet, customCoins]);

  const hiddenAssetRows = useMemo(() => {
    const byId = new Map(assetUniverse.map(asset => [asset.id, asset]));
    return hiddenTokens.map(id => byId.get(id) ?? {
      id,
      symbol: id.split(':').pop()?.slice(0, 12).toUpperCase() || 'TOKEN',
      name: 'Hidden token',
      balance: 0,
      price: 0,
      value: 0,
      chain: 'pulsechain' as Chain,
      pnl24h: 0,
    });
  }, [assetUniverse, hiddenTokens]);

  const hideToken = (id: string) => {
    setHiddenTokens(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const unhideToken = (id: string) => {
    setHiddenTokens(prev => prev.filter(tokenId => tokenId !== id));
  };

  const currentAssets = useMemo(() => {
    return assetUniverse
      .filter(a => !hiddenTokens.includes(a.id))
      .filter(a => !hideDust || a.value >= 1 || (a.balance > 0 && a.price === 0))
      .filter(a => !hideSpam || (!(a as any).isSpam && !spamTokenIds.includes(a.id)))
      .map(a => {
        const addr = (a as any).address?.toLowerCase?.();
        const isEHex = (a.chain === 'ethereum' && addr === ETH_HEX_ADDR) || (a.chain === 'pulsechain' && addr === EHEX_PULSECHAIN_ADDR);
        if (isEHex) {
          const ehexPriceData = prices['hex'] || prices[`ethereum:${ETH_HEX_ADDR}`];
          if (ehexPriceData?.usd) {
            const price = ehexPriceData.usd;
            return {
              ...a,
              price,
              value: a.balance * price,
              priceChange24h: ehexPriceData.usd_24h_change ?? a.priceChange24h,
              priceChange1h: ehexPriceData.usd_1h_change ?? a.priceChange1h,
              priceChange7d: ehexPriceData.usd_7d_change ?? a.priceChange7d,
              pnl24h: ehexPriceData.usd_24h_change ?? a.pnl24h,
              entryPls: manualEntries[a.id] || 0
            };
          }
        }
        return {
          ...a,
          entryPls: manualEntries[a.id] || 0
        };
      });
  }, [assetUniverse, manualEntries, hiddenTokens, hideDust, hideSpam, spamTokenIds, prices]);

  const currentStakes = useMemo(() => {
    const key = activeWallet?.toLowerCase() ?? null;
    return key ? realStakes.filter(s => s.walletAddress === key) : realStakes;
  }, [realStakes, activeWallet]);

  const normalizeHoldingAssets = useMemo(() => {
    const plsUsdPrice = prices['pulsechain']?.usd || 0;
    const leagueSymbols = new Set(['PLS', 'PLSX', 'HEX', 'EHEX', 'INC', 'PRVX']);
    return (assets: Asset[]): HoldingDisplayAsset[] =>
      assets.map(asset => {
        const symbolUpper = asset.symbol.toUpperCase();
        const isLeagueSupported = leagueSymbols.has(symbolUpper);
        return {
          ...asset,
          priceUsd: asset.price,
          pricePls: plsUsdPrice > 0 ? asset.price / plsUsdPrice : 0,
          valueUsd: asset.value,
          valuePls: plsUsdPrice > 0 ? asset.value / plsUsdPrice : 0,
          leagueLabel: isLeagueSupported ? 'League' : '-',
          leagueRank: null,
          leagueSource: isLeagueSupported ? 'OpenPulseChain' : null,
          entryPls: manualEntries[asset.id] || 0,
        };
      });
  }, [manualEntries, prices]);

  const currentHistory = history;
  const currentTransactions = useMemo(() => {
    return transactions.map(tx => ({
      ...tx,
      asset: normalizeAssetSymbol(tx.asset, tx.chain),
      counterAsset: tx.counterAsset ? normalizeAssetSymbol(tx.counterAsset, tx.chain) : tx.counterAsset,
    }));
  }, [transactions]);

  const unpricedCount = useMemo(() => {
    return currentAssets.filter(a => a.price === 0).length;
  }, [currentAssets]);

  const swapTransactions24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return currentTransactions.filter((tx) => {
      if (tx.chain !== 'pulsechain') return false;
      if (tx.timestamp < cutoff) return false;
      return tx.type === 'swap' || !!tx.swapLegOnly;
    });
  }, [currentTransactions]);

  const historyController = useHistoryController({
    currentAssets,
    currentTransactions,
    selectedWalletAddr,
    prices,
    matchesAssetSymbol: sameAssetSymbol,
  });
  const {
    txTypeFilter,
    setTxTypeFilter,
    txAssetFilter,
    setTxAssetFilter,
    txYearFilter,
    setTxYearFilter,
    txCoinCategory,
    setTxCoinCategory,
    txChainFilter,
    setTxChainFilter,
    txBridgeProtocolFilter,
    txOriginChainFilter,
    txStakingActionFilter,
    filteredTransactions,
    swapAssetFilterOptions,
    swapYearFilterOptions,
    hasActiveSwapFilters,
    holdingsPulsechainTransactions,
    activeHistoryAsset,
    historySummary,
    resetHistoryFilters,
    applyHistoryDrilldownIntent,
  } = historyController;

  useEffect(() => {
    if (activeTab === 'history') return;
    resetHistoryFilters();
  }, [activeTab, resetHistoryFilters]);

  const openHistoryDrilldown = React.useCallback((intent: HistoryDrilldownIntent) => {
    applyHistoryDrilldownIntent(intent);
    setActiveTab('history');
  }, [applyHistoryDrilldownIntent, setActiveTab]);

  const summary = usePortfolioSummaryController({
    currentAssets,
    currentStakes,
    currentTransactions,
    prices,
    wallets,
  });

  const pieData = Object.entries(summary.chainDistribution).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: value as number
  })).filter(d => (d.value as number) > 0);

  const COLORS = [CHAINS.pulsechain.color, CHAINS.ethereum.color, CHAINS.base.color];

  const stakeSummary = useMemo(() => {
    const stakes = realStakes;
    const activeStakes = stakes.filter(s => (s.daysRemaining ?? 0) > 0);
    let totalStakedHex = 0;
    let totalTShares = 0;
    let totalValueUsd = 0;
    let totalInterestHex = 0;

    activeStakes.forEach(s => {
      const stakedHex  = Number(s.stakedHearts ?? 0n) / 1e8;
      const tShares    = Number(s.stakeShares  ?? 0n) / 1e12;
      // Recalculate accrued yield from first principles using chain-specific rate
      // so stale cached interestHearts never corrupt the totals.
      const daysStaked  = Math.max(0, (s.stakedDays ?? 0) - (s.daysRemaining ?? 0));
      const rate = s.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
      const interestHex = tShares * daysStaked * rate;

      // Use chain-specific HEX price; fall back to 0 (not 0.004) so we show
      // $0 instead of a wrong value while prices are still loading.
      const hexPriceKey = `${s.chain}:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39`;
      const chainHexFallback = s.chain === 'pulsechain' ? prices['pulsechain:hex']?.usd : prices['hex']?.usd;
      const hexPrice = prices[hexPriceKey]?.usd || chainHexFallback || 0;

      totalStakedHex  += stakedHex;
      totalTShares    += tShares;
      totalValueUsd   += (stakedHex + interestHex) * hexPrice;
      totalInterestHex += interestHex;
    });

    const phexPrice = prices['pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39']?.usd || prices['pulsechain:hex']?.usd || 0;
    // Daily payout uses chain-specific rates; sum pHEX and eHEX T-Share contributions separately
    const estimatedDailyPayoutHex = activeStakes.reduce((sum, s) => {
      const tS = Number(s.stakeShares ?? 0n) / 1e12;
      const rate = s.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
      return sum + tS * rate;
    }, 0);
    const estimatedDailyPayoutUsd = estimatedDailyPayoutHex * phexPrice;

    return {
      totalStakedHex,
      totalTShares,
      totalValueUsd,
      totalInterestHex,
      totalHexWithRewards: totalStakedHex + totalInterestHex,
      estimatedDailyPayoutHex,
      estimatedDailyPayoutUsd
    };
  }, [realStakes, prices]);

  const assetAllocation = useMemo(() => {
    // Aggregate by symbol across chains (e.g. ETH on Ethereum + ETH on Base)
    const agg: Record<string, number> = {};
    realAssets.filter(a => a.value > 0).forEach(a => {
      agg[a.symbol] = (agg[a.symbol] || 0) + a.value;
    });
    return Object.entries(agg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [realAssets]);

  useEffect(() => {
    const total = assetAllocation.reduce((sum, a) => sum + a.value, 0);
    if (total <= 0) {
      setAllocationDraftPercentages({});
      return;
    }
    setAllocationDraftPercentages(prev => {
      const next: Record<string, number> = {};
      assetAllocation.forEach(a => {
        next[a.name] = prev[a.name] ?? ((a.value / total) * 100);
      });
      return next;
    });
  }, [assetAllocation]);

  const allocationCalculatorRows = useMemo(() => {
    const portfolioTotal = summary.totalValue || 0;
    return assetAllocation.map(a => {
      const pct = Math.min(100, Math.max(0, allocationDraftPercentages[a.name] ?? 0));
      return {
        name: a.name,
        percent: pct,
        value: (portfolioTotal * pct) / 100
      };
    });
  }, [assetAllocation, allocationDraftPercentages, summary.totalValue]);

  const rotationSummary = useMemo(() => {
    let totalRotationPnlPls = 0;
    let totalRotationPnlUsd = 0;
    const plsPrice = prices['pulsechain']?.usd || 0.00005;

    realAssets.forEach(asset => {
      const entryPls = manualEntries[asset.id];
      if (entryPls && entryPls > 0) {
        const currentPlsValue = asset.value / plsPrice;
        const pnlPls = currentPlsValue - entryPls;
        totalRotationPnlPls += pnlPls;
        totalRotationPnlUsd += pnlPls * plsPrice;
      }
    });

    return {
      totalRotationPnlPls,
      totalRotationPnlUsd
    };
  }, [realAssets, manualEntries, prices]);

  const monthlyPnlData = useMemo(() => {
    const pts = history;
    const byMonth: Record<string, { month: string; pnl: number }> = {};
    pts.forEach(p => {
      const key = format(p.timestamp, 'MMM yy');
      if (!byMonth[key]) byMonth[key] = { month: key, pnl: 0 };
      byMonth[key].pnl += p.pnl;
    });
    return Object.values(byMonth).slice(-12);
  }, [history]);

  const receivedAssetsData = useMemo(() => {
    const START_2021 = new Date('2021-01-01').getTime();
    const ethPrice = prices['ethereum']?.usd || 3400;
    const effectiveReceivedChainFilter = receivedChainFilter === 'pulsechain' ? 'all' : receivedChainFilter;

    const filtered = currentTransactions.filter(tx => {
      const typeMatch = tx.type === 'deposit' || (tx.type as string) === 'receive';
      const allowedBridgeChain = tx.chain === 'ethereum' || tx.chain === 'base';
      const chainMatch = allowedBridgeChain && (effectiveReceivedChainFilter === 'all' || tx.chain === effectiveReceivedChainFilter);
      const dateMatch = tx.timestamp >= START_2021;
      const assetUpper = tx.asset.toUpperCase();
      const assetMatch = assetUpper === 'ETH' ||
                         assetUpper === 'PLS' ||
                         assetUpper.includes('USDC') ||
                         assetUpper.includes('USD COIN') ||
                         assetUpper.includes('USDBC') ||
                         assetUpper.includes('USDT') ||
                         assetUpper.includes('TETHER') ||
                         assetUpper.includes('DAI');
      // Exclude dust (gas refunds, tiny transfers)
      const notDust = tx.valueUsd ? tx.valueUsd >= 1 : (tx.amount > 0.0001 || (assetUpper !== 'ETH' && assetUpper !== 'PLS' && tx.amount > 0.01));
      return typeMatch && chainMatch && dateMatch && assetMatch && notDust;
    });

    // Apply coin filter
    const coinFiltered = receivedCoinFilter === 'all' ? filtered : filtered.filter(tx => {
      const assetUpper = tx.asset.toUpperCase();
      if (receivedCoinFilter === 'ETH') return assetUpper === 'ETH';
      if (receivedCoinFilter === 'PLS') return assetUpper === 'PLS';
      if (receivedCoinFilter === 'USDC') return assetUpper.includes('USDC') || assetUpper.includes('USD COIN') || assetUpper.includes('USDBC');
      if (receivedCoinFilter === 'USDT') return assetUpper.includes('USDT') || assetUpper.includes('TETHER');
      if (receivedCoinFilter === 'DAI') return assetUpper.includes('DAI');
      return true;
    });

    // Sort oldest first - shows the full history chronologically
    const list = [...coinFiltered].sort((a, b) => a.timestamp - b.timestamp);

    // Per-asset totals
    const plsPrice = prices['pulsechain']?.usd || 0.00005;
    const getStablePrice = (tx: typeof list[0], stable: 'USDC' | 'USDT' | 'DAI') => {
      if (tx.chain === 'pulsechain') {
        if (stable === 'DAI') {
          return prices['pulsechain:0xefd766ccb38eaf1dfd701853bfce31359239f305']?.usd
            ?? prices['pulsechain:0x6b175474e89094c44da98b954eedeac495271d0f']?.usd
            ?? prices['pulsechain:dai']?.usd
            ?? 0;
        }
        if (stable === 'USDT') return prices['pulsechain:0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f']?.usd ?? 0;
        return prices['pulsechain:0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07']?.usd ?? 0;
      }
      if (stable === 'DAI') return prices['dai']?.usd ?? 0;
      if (stable === 'USDT') return prices['tether']?.usd ?? 1;
      return prices['usd-coin']?.usd ?? 1;
    };

    const getUsd = (tx: typeof list[0]) => {
      if (tx.valueUsd) return tx.valueUsd;
      const a = tx.asset.toUpperCase();
      if (a === 'ETH') return tx.amount * ethPrice;
      if (a === 'PLS') return tx.amount * plsPrice;
      if (a.includes('USDT') || a.includes('TETHER')) return tx.amount * getStablePrice(tx, 'USDT');
      if (a.includes('DAI')) return tx.amount * getStablePrice(tx, 'DAI');
      return tx.amount * getStablePrice(tx, 'USDC'); // USDC and other stables
    };

    const byAsset: Record<string, { amount: number; valueUsd: number }> = {};
    list.forEach(tx => {
      const assetUpper = tx.asset.toUpperCase();
      const key = assetUpper === 'PLS' ? 'PLS' :
                  assetUpper === 'ETH' ? 'ETH' :
                  assetUpper.includes('DAI') ? 'DAI' :
                  assetUpper.includes('USDT') || assetUpper.includes('TETHER') ? 'USDT' : 'USDC';
      if (!byAsset[key]) byAsset[key] = { amount: 0, valueUsd: 0 };
      byAsset[key].amount += tx.amount;
      byAsset[key].valueUsd += getUsd(tx);
    });

    const totalValue = list.reduce((acc, tx) => acc + getUsd(tx), 0);

    return { list, totalValue, byAsset };
  }, [currentTransactions, prices, receivedCoinFilter, receivedChainFilter]);

  // PLS/WPLS Movement Tracker - includes all PLS/WPLS transfers (in/out) and swaps on PulseChain
  // This works even when PulseChain transactions are typed as 'transfer_in'/'transfer_out'
  // because Blockscout does not tag on-chain swaps as type='swap'.
  const plsSwapData = useMemo(() => {
    const isPls = (sym: string) => {
      const u = (sym || '').toUpperCase();
      return u === 'PLS' || u === 'WPLS';
    };
    const plsPrice = prices['pulsechain']?.usd || 0;

    const rows = currentTransactions
      .filter(tx => {
        // Include swaps where PLS is on either leg
        if (tx.type === 'swap' && (isPls(tx.asset) || isPls(tx.counterAsset || ''))) return true;
        // Include all PLS/WPLS native transfers on PulseChain (since Blockscout doesn't tag swaps)
        if (tx.chain === 'pulsechain' && isPls(tx.asset) && (tx.type === 'deposit' || tx.type === 'withdraw')) return true;
        return false;
      })
      .map(tx => {
        let plsReceived = 0;
        let plsSpent = 0;
        if (tx.type === 'swap') {
          plsReceived = isPls(tx.asset) ? tx.amount : 0;
          plsSpent = isPls(tx.counterAsset || '') ? (tx.counterAmount || 0) : 0;
        } else if (tx.type === 'deposit') {
          plsReceived = tx.amount;
        } else if (tx.type === 'withdraw') {
          plsSpent = tx.amount;
        }
        const netPls = plsReceived - plsSpent;
        return { tx, plsReceived, plsSpent, netPls };
      })
      .sort((a, b) => b.tx.timestamp - a.tx.timestamp);

    const totalReceived = rows.reduce((s, r) => s + r.plsReceived, 0);
    const totalSpent = rows.reduce((s, r) => s + r.plsSpent, 0);
    const totalNet = totalReceived - totalSpent;
    const netUsd = totalNet * plsPrice;
    return { rows, totalReceived, totalSpent, totalNet, netUsd, plsPrice };
  }, [currentTransactions, prices]);

  useEffect(() => {
    const fetchMarketData = async () => {
      for (const id of expandedAssetIds) {
        if (tokenMarketData[id]) continue;
        const asset = currentAssets.find(a => a.id === id);
        if (!asset) continue;
        const addr = (asset as any).address;
        if (!addr || addr === 'native') continue;
        try {
          const summary = await fetchDexScreenerSummary(
            addr,
            FALLBACK_DESCRIPTIONS[addr ? addr.toLowerCase() : ''] || null,
          );
          if (!summary) continue;
          setTokenMarketData(prev => ({
            ...prev,
            [id]: {
              ...summary,
            }
          }));
          const dsImg = summary.imageUrl;
          if (dsImg && !STATIC_LOGOS[addr.toLowerCase()]) setTokenLogos(prev => ({ ...prev, [addr.toLowerCase()]: dsImg }));
        } catch { /* ignore */ }
      }
    };
    fetchMarketData();
  }, [expandedAssetIds]); // intentionally omits tokenMarketData (cache check) and currentAssets (stable ref) to avoid re-fetching on unrelated renders

  // -- Fetch market data when token card modal opens ------------------------
  // For native PLS, use the WPLS contract address since DexScreener tracks WPLS pairs.
  const WPLS_ADDR = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
  useEffect(() => {
    if (!tokenCardModal) return;
    const id   = tokenCardModal.id;
    const rawAddr = (tokenCardModal as any).address as string | undefined;
    // PLS is native - fall back to WPLS so we can show DexScreener market data
    const isNativePls = (!rawAddr || rawAddr === 'native') && tokenCardModal.chain === 'pulsechain';
    const addr = isNativePls ? WPLS_ADDR : rawAddr;
    if (!addr || addr === 'native') return;
    if (tokenMarketData[id]) { setTokenCardModalLoading(false); return; }
    setTokenCardModalLoading(true);
    (async () => {
      try {
        const bsBase = resolveBlockscoutBase();
        const [dsResult, holderResult] = await Promise.allSettled([
          fetchDexScreenerSummary(addr, FALLBACK_DESCRIPTIONS[addr ? addr.toLowerCase() : ''] || null),
          tokenCardModal?.chain === 'pulsechain' && !isNativePls
            ? fetch(`${bsBase}/tokens/${addr}`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
        ]);
        const summary = dsResult.status === 'fulfilled' ? dsResult.value : null;
        const holderData = holderResult.status === 'fulfilled' ? holderResult.value : null;
        const holders: number | null = holderData?.holders ? (parseInt(String(holderData.holders), 10) || null) : null;
        if (!summary) return;
        setTokenMarketData(prev => ({
          ...prev,
          [id]: {
            ...summary,
            ...(holders != null ? { holders } : {}),
          },
        }));
        const dsImg = summary.imageUrl;
        if (dsImg && !isNativePls && !STATIC_LOGOS[addr.toLowerCase()]) setTokenLogos(prev => ({ ...prev, [addr.toLowerCase()]: dsImg }));
      } catch { /* ignore */ }
      finally { setTokenCardModalLoading(false); }
    })();
  }, [tokenCardModal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Auto-fetch market data for top 9 overview assets when Overview tab is active --
  // This ensures all cards show live market data (mcap, liquidity, vol) without requiring
  // the user to click each card individually.
  useEffect(() => {
    if (activeTab !== 'overview' || currentAssets.length === 0) return;
    const topAssets = [...currentAssets].sort((a, b) => b.value - a.value).slice(0, 9);
    const toFetch = topAssets.filter(a => {
      const addr = (a as any).address;
      return addr && addr !== 'native' && !tokenMarketData[a.id];
    });
    if (toFetch.length === 0) return;
    Promise.all(toFetch.map(async (asset) => {
      const addr = (asset as any).address as string;
      const bsBase = resolveBlockscoutBase();
      try {
        const [dsResult, holderResult] = await Promise.allSettled([
          fetchDexScreenerSummary(addr, FALLBACK_DESCRIPTIONS[addr ? addr.toLowerCase() : ''] || null),
          asset.chain === 'pulsechain'
            ? fetch(`${bsBase}/tokens/${addr}`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
        ]);
        const summary = dsResult.status === 'fulfilled' ? dsResult.value : null;
        const holderData = holderResult.status === 'fulfilled' ? holderResult.value : null;
        const holders: number | null = holderData?.holders ? (parseInt(String(holderData.holders), 10) || null) : null;
        if (!summary) return;
        setTokenMarketData(prev => ({
          ...prev,
          [asset.id]: {
            ...prev[asset.id],
            ...summary,
            ...(holders != null ? { holders } : {}),
          },
        }));
        const dsImg = summary.imageUrl;
        if (dsImg && !STATIC_LOGOS[addr.toLowerCase()]) setTokenLogos(prev => ({ ...prev, [addr.toLowerCase()]: dsImg }));
      } catch { /* ignore */ }
    }));
  }, [activeTab, currentAssets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- tokenPrices: symbol -> USD price map for LP hook ---------------------
  const tokenPrices = useMemo<Record<string, number>>(() => {
    const p = prices;
    const wplsUsd = p['pulsechain']?.usd ?? p['pulsechain:native']?.usd ?? 0;
    return {
      'WPLS':  wplsUsd,
      'PLS':   wplsUsd,
      'PLSX':  p['pulsechain:0x95b303987a60c71504d99aa1b13b4da07b0790ab']?.usd ?? p['pulsex']?.usd ?? 0,
      'INC':   p['pulsechain:0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d']?.usd ?? p['incentive']?.usd ?? 0,
      'pHEX':  p['pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39']?.usd ?? p['pulsechain:hex']?.usd ?? 0,
      'pWETH': p['pulsechain:0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c']?.usd ?? p['ethereum']?.usd ?? 0,
      'pWBTC': p['pulsechain:0xb17d901469b9208b17d916112988a3fed19b5ca1']?.usd ?? p['wrapped-bitcoin']?.usd ?? 0,
      'pDAI':  p['pulsechain:0xefd766ccb38eaf1dfd701853bfce31359239f305']?.usd ?? 0,
      'pUSDC': p['pulsechain:0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07']?.usd ?? 0,
      'pUSDT': p['pulsechain:0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f']?.usd ?? 0,
    };
  }, [prices]);

  const CHAIN_COLORS: Record<string, string> = {
    pulsechain: '#f739ff',
    ethereum: '#627EEA',
    base: '#0052FF',
  };

  const explorerUrl = (chain: string, address: string) => {
    if (!address || address === 'native') return null;
    if (chain === 'pulsechain') return `https://scan.pulsechain.com/token/${address}`;
    if (chain === 'ethereum') return `https://etherscan.io/token/${address}`;
    if (chain === 'base') return `https://base.blockscout.com/token/${address}`;
    return null;
  };

  const dexScreenerUrl = (chain: string, address: string) => {
    if (!address || address === 'native') return null;
    const slug = chain === 'pulsechain' ? 'pulsechain' : chain === 'base' ? 'base' : 'ethereum';
    return `https://dexscreener.com/${slug}/${address}`;
  };

  const getTokenLogoUrl = (asset: Asset): string => {
    // 0. STATIC_LOGOS always wins - curated logos that must never be overwritten by any remote source
    const addrKey0 = (asset as any).address?.toLowerCase?.() as string | undefined;
    if (addrKey0 && STATIC_LOGOS[addrKey0]) return STATIC_LOGOS[addrKey0];
    // 1. Use any logo already fetched and stored on the asset (CoinGecko / DeFi Llama)
    if (asset.logoUrl) return asset.logoUrl;
    // 2. Well-known native / base tokens
    if (asset.symbol === 'ETH') return 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';
    if (asset.symbol === 'PLS' || asset.symbol === 'WPLS') return 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png';
    // 3. PulseChain tokens via PulseX CDN (URL path is case-sensitive - must use checksummed address)
    if (asset.chain === 'pulsechain') {
      const tokenConfig = TOKENS.pulsechain.find(t => t.symbol === asset.symbol);
      if (tokenConfig && tokenConfig.address !== 'native') {
        try { return `https://tokens.app.pulsex.com/images/tokens/${getAddress(tokenConfig.address)}.png`; } catch { /* invalid address */ }
      }
      // Also try the address stored directly on the asset (for discovered tokens)
      const addrOnAsset = (asset as any).address;
      if (addrOnAsset && addrOnAsset !== 'native') {
        try { return `https://tokens.app.pulsex.com/images/tokens/${getAddress(addrOnAsset)}.png`; } catch { /* invalid address */ }
      }
    }
    // 4. Ethereum + Base tokens via TrustWallet (also case-sensitive)
    if (asset.chain === 'ethereum' || asset.chain === 'base') {
      const chainName = asset.chain === 'base' ? 'base' : 'ethereum';
      const tokenConfig = (TOKENS[asset.chain] as any[]).find((t: any) => t.symbol === asset.symbol);
      if (tokenConfig && tokenConfig.address !== 'native') {
        try { return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainName}/assets/${getAddress(tokenConfig.address)}/logo.png`; } catch { /* invalid address */ }
      }
    }
    // 5. Fall back to tokenLogos map (covers DexScreener CDN images cached during market-data fetch)
    if (addrKey0 && tokenLogos[addrKey0]) return tokenLogos[addrKey0];
    return '';
  };

  // -- RENDER ----------------------------------------------------------------

  // Shared compact price formatter - used by both the header ticker and core-coins panel
  const fmtPrice = (p: number) => {
    if (p === 0) return '-';
    if (p < 0.00001) return `$${p.toFixed(10)}`;
    if (p < 0.001)   return `$${p.toFixed(8)}`;
    if (p < 0.01)    return `$${p.toFixed(6)}`;
    if (p < 1)       return `$${p.toFixed(4)}`;
    return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  const fmtMarket = (v?: number | null) =>
    v == null ? '-' :
    v >= 1e12 ? `$${(v/1e12).toFixed(2)}T` :
    v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` :
    v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` :
    v >= 1e3 ? `$${(v/1e3).toFixed(1)}K` :
    `$${v.toFixed(0)}`;

  const getFrontMarketChange = (marketData: any, priceData: any, asset?: Asset | null): number | null => {
    if (frontMarketPeriod === '5m') return marketData?.priceChange5m ?? null;
    if (frontMarketPeriod === '1h') return marketData?.priceChange1h ?? priceData?.usd_1h_change ?? asset?.priceChange1h ?? null;
    if (frontMarketPeriod === '6h') return marketData?.priceChange6h ?? null;
    if (frontMarketPeriod === '7d') return marketData?.priceChange7d ?? priceData?.usd_7d_change ?? asset?.priceChange7d ?? null;
    return marketData?.priceChange24h ?? priceData?.usd_24h_change ?? asset?.priceChange24h ?? asset?.pnl24h ?? null;
  };

  type PortfolioPriceCard = {
    id: string;
    symbol: string;
    name: string;
    price: number;
    change24h: number | null;
    marketCap?: number | null;
    volume24h?: number | null;
    accent?: string;
    logo?: string;
  };

  const coreLiveTokens = useMemo(() => ([
    { id: 'PLS',  symbol: 'PLS',  name: 'PulseChain',    priceKey: 'pulsechain',                                                    changeKey: 'pulsechain:native', accent: 'linear-gradient(90deg,#00ff9f,#00cfff)',                                              logo: 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png' },
    { id: 'PLSX', symbol: 'PLSX', name: 'PulseX',        priceKey: 'pulsechain:0x95b303987a60c71504d99aa1b13b4da07b0790ab',            accent: 'linear-gradient(90deg,#ff00bf,#7b00ff)',                                              logo: 'https://tokens.app.pulsex.com/images/tokens/0x95B303987A60C71504D99Aa1b13B4DA07b0790ab.png' },
    { id: 'INC',  symbol: 'INC',  name: 'Incentive',     priceKey: 'pulsechain:0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d',            accent: 'linear-gradient(90deg,#39ff14,#00ff9f)',                                              logo: 'https://tokens.app.pulsex.com/images/tokens/0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d.png' },
    { id: 'HEX',  symbol: 'HEX',  name: 'pHEX',          priceKey: 'pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',            accent: 'linear-gradient(90deg,#ff6b35,#f7931a)',                                              logo: 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png' },
    { id: 'PRVX', symbol: 'PRVX', name: 'PrivacyX',      priceKey: 'pulsechain:0xf6f8db0aba00007681f8faf16a0fda1c9b030b11',            accent: 'linear-gradient(90deg,#6c3ce1,#b044ff)',                                              logo: 'https://cdn.dexscreener.com/cms/images/ODHYYN7yppDHnd6u?width=64&height=64&fit=crop&quality=95&format=auto' },
    { id: 'eHEX', symbol: 'eHEX', name: 'Ethereum HEX',  priceKey: 'ethereum:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',              accent: 'linear-gradient(90deg,#ff0080,#ff6b35,#ffeb3b,#00ff9f,#00cfff,#7b00ff)',             logo: 'https://cdn.dexscreener.com/cms/images/a46bd12940d8501c2aacdd10ad4780e818bdedaba1ec8eb46b52e4d8313d4a93?width=64&height=64&fit=crop&quality=95&format=auto' },
  ]), []);

  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'home') return;
    const missing = coreLiveTokens.filter(token => !tokenMarketData[`live:${token.id}`]);
    if (missing.length === 0) return;
    const WPLS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
    missing.forEach(async (token) => {
      const rawAddr = token.priceKey === 'pulsechain' ? WPLS : token.priceKey.includes(':') ? token.priceKey.split(':')[1] : null;
      if (!rawAddr) return;
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${rawAddr.toLowerCase()}`);
        if (!res.ok) return;
        const data = await res.json();
        const pairs: any[] = data.pairs || [];
        if (pairs.length === 0) return;
        const expectedChain = token.priceKey.includes(':') ? token.priceKey.split(':')[0] : 'pulsechain';
        const chainPairs = pairs.filter((p: any) => p.chainId === expectedChain);
        const sorted = [...(chainPairs.length ? chainPairs : pairs)].sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const top = sorted[0];
        setTokenMarketData(prev => ({
          ...prev,
          [`live:${token.id}`]: {
            volume24h: sorted.reduce((s: number, p: any) => s + (p.volume?.h24 || 0), 0),
            marketCap: top?.marketCap || null,
            fdv: top?.fdv || null,
            priceChange5m: top?.priceChange?.m5 ?? null,
            priceChange1h: top?.priceChange?.h1 ?? null,
            priceChange6h: top?.priceChange?.h6 ?? null,
            priceChange24h: top?.priceChange?.h24 ?? null,
            priceChange7d: top?.priceChange?.d7 ?? null,
          },
        }));
      } catch { /* ignore */ }
    });
  }, [activeTab, coreLiveTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const topHoldingCards = useMemo<PortfolioPriceCard[]>(() => {
    return coreLiveTokens.map(token => {
      const md = prices[token.priceKey] || prices[token.changeKey ?? ''];
      const tokenAddress = token.priceKey.includes(':') ? token.priceKey.split(':')[1]?.toLowerCase() : '';
      const heldAsset = currentAssets.find(asset =>
        (tokenAddress && (asset as any).address?.toLowerCase?.() === tokenAddress) ||
        asset.symbol.toUpperCase() === token.symbol.toUpperCase()
      );
      const liveMarketData = tokenMarketData[`live:${token.id}`] || (heldAsset ? tokenMarketData[heldAsset.id] : null);
      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        price: md?.usd || heldAsset?.price || 0,
        change24h: getFrontMarketChange(liveMarketData, md, heldAsset),
        marketCap: liveMarketData?.marketCap ?? liveMarketData?.fdv ?? null,
        volume24h: liveMarketData?.volume24h ?? null,
        accent: token.accent,
        logo: token.logo,
      };
    });
  }, [coreLiveTokens, currentAssets, prices, tokenMarketData, frontMarketPeriod]);

  const frontPageGridTokens = useMemo<PortfolioPriceCard[]>(() => {
    const cards = new Map<string, PortfolioPriceCard>();
    const add = (card: PortfolioPriceCard) => {
      const key = card.symbol.toUpperCase();
      if (!cards.has(key)) cards.set(key, card);
    };

    topHoldingCards.forEach(add);

    const sourceAssets = currentAssets;
    [...sourceAssets]
      .filter(asset => asset.value > 0)
      .sort((a, b) => b.value - a.value)
      .forEach(asset => {
        const logo = STATIC_LOGOS[(asset as any).address?.toLowerCase?.()] || (asset as any).logoUrl || tokenLogos[(asset as any).address?.toLowerCase?.()] || getTokenLogoUrl(asset);
        const chainColor = CHAIN_COLORS[asset.chain] || '#00FF9F';
        add({
          id: `${asset.chain}:${asset.symbol}`,
          symbol: asset.symbol,
          name: asset.name || asset.chain,
          price: asset.price,
          change24h: getFrontMarketChange(tokenMarketData[asset.id], null, asset),
          marketCap: tokenMarketData[asset.id]?.marketCap ?? tokenMarketData[asset.id]?.fdv ?? null,
          volume24h: tokenMarketData[asset.id]?.volume24h ?? null,
          accent: `linear-gradient(90deg, ${chainColor}, rgba(0,255,159,0.85))`,
          logo,
        });
      });

    return [...cards.values()].slice(0, 9);
  }, [topHoldingCards, currentAssets, tokenMarketData, tokenLogos, frontMarketPeriod]);

  const frontPagePortfolioRows = useMemo(() => {
    return currentAssets
      .filter(asset => asset.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [currentAssets]);

  const frontPageCoinItems = useMemo<CoinListItem[]>(() => {
    return frontPagePortfolioRows.map((asset) => {
      const assetAddress = (asset as any).address;
      const addressKey = assetAddress?.toLowerCase?.() ?? '';
      const md = tokenMarketData[asset.id];
      const logoUrl = STATIC_LOGOS[addressKey] || (asset as any).logoUrl || tokenLogos[addressKey] || getTokenLogoUrl(asset);
      const plsUsdPrice = prices['pulsechain']?.usd || 0;

      return {
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol,
        chain: asset.chain,
        logoUrl,
        contractAddress: assetAddress,
        priceUsd: asset.price,
        pricePls: plsUsdPrice > 0 ? asset.price / plsUsdPrice : undefined,
        change24h: asset.pnl24h ?? asset.priceChange24h ?? 0,
        balance: asset.balance,
        valueUsd: asset.value,
        valuePls: plsUsdPrice > 0 ? asset.value / plsUsdPrice : undefined,
        liquidityUsd: md?.liquidity ?? null,
        volume24hUsd: md?.volume24h ?? null,
        pools: md?.pairsCount ?? null,
      };
    });
  }, [frontPagePortfolioRows, tokenMarketData, tokenLogos, prices, getTokenLogoUrl]);

  const investmentRows = useMemo(() => {
    const ethUsdPrice = prices['ethereum']?.usd
      || prices['ethereum:native']?.usd
      || prices['pulsechain:0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c']?.usd
      || 0;
    return buildInvestmentRows(currentAssets, currentTransactions, ethUsdPrice);
  }, [currentAssets, currentTransactions, prices]);

  const walletAnalyzerPrices = useMemo(() => {
    const next: Record<string, number> = {};
    currentAssets.forEach((asset) => {
      next[`${asset.chain}:${asset.symbol}`] = asset.price;
      const address = (asset as any).address?.toLowerCase?.();
      if (address) {
        next[`${asset.chain}:${address}`] = asset.price;
      }
    });
    return next;
  }, [currentAssets]);

  const walletAnalyzerModel = useMemo(() => {
    return buildWalletAnalyzerModel({
      history: currentHistory,
      assets: currentAssets,
      summary,
      transactions: currentTransactions,
      investmentRows,
      currentPrices: walletAnalyzerPrices,
    });
  }, [currentAssets, currentHistory, currentTransactions, investmentRows, summary, walletAnalyzerPrices]);
  const walletAnalyzerPageProps = useMemo(() => {
    return buildWalletAnalyzerPageProps({
      model: walletAnalyzerModel,
      investmentRows,
      plsUsdPrice: prices['pulsechain']?.usd || 0,
      onOpenTransactions: openHistoryDrilldown,
      onOpenPlanner: () => setProfitPlannerOpen(true),
    }).pageProps;
  }, [investmentRows, openHistoryDrilldown, prices, walletAnalyzerModel]);

  const swapPnl24hUsd = useMemo(() => {
    return swapTransactions24h.reduce((sum, tx) => {
      if (tx.type !== 'swap') return sum;
      const asset = currentAssets.find((candidate) => sameAssetSymbol(candidate.symbol, tx.asset, candidate.chain) && candidate.chain === tx.chain);
      const entryUsd = (tx.valueUsd ?? 0) > 0
        ? (tx.valueUsd ?? 0)
        : (tx.assetPriceUsdAtTx ?? 0) > 0
          ? tx.amount * (tx.assetPriceUsdAtTx ?? 0)
          : 0;
      if (!asset || entryUsd <= 0 || asset.price <= 0) return sum;
      return sum + ((tx.amount * asset.price) - entryUsd);
    }, 0);
  }, [currentAssets, swapTransactions24h]);

  const trackedMarketCount = useMemo(() => {
    return currentAssets.filter((asset) => asset.chain === 'pulsechain' && asset.price > 0).length;
  }, [currentAssets]);


  const frontPageChainRows = useMemo(() => {
    const entries = Object.entries(summary.chainDistribution)
      .map(([chain, value]) => ({ chain, value: value as number }))
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value);
    if (entries.length > 0) return entries;
    return [
      { chain: 'pulsechain', value: 74 },
      { chain: 'ethereum', value: 18 },
      { chain: 'base', value: 8 },
    ];
  }, [summary.chainDistribution]);

  const frontPagePulseTips = useMemo(() => {
    const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    const latestPulseFlow = currentTransactions
      .filter(tx => tx.chain === 'pulsechain' && (tx.type === 'deposit' || tx.type === 'swap'))
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const mover = [...topHoldingCards]
      .filter(token => token.change24h != null)
      .sort((a, b) => Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0))[0];
    const offChainCapital = currentAssets
      .filter(asset => asset.chain === 'ethereum' || asset.chain === 'base')
      .reduce((sum, asset) => sum + asset.value, 0);
    const largestHolding = frontPagePortfolioRows[0];

    return [
      latestPulseFlow ? {
        tag: 'Flow',
        title: `${latestPulseFlow.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${latestPulseFlow.asset} reached PulseChain`,
        body: latestPulseFlow.type === 'deposit'
          ? 'Fresh capital or bridged inventory just landed on PulseChain.'
          : 'A recent swap rotated capital into a new PulseChain position.',
        meta: dateFmt.format(new Date(latestPulseFlow.timestamp)),
      } : null,
      mover ? {
        tag: 'Momentum',
        title: `${mover.symbol} is moving the board`,
        body: `${mover.change24h! >= 0 ? '+' : ''}${mover.change24h!.toFixed(2)}% on the active PulseBoard window.`,
        meta: 'PulseBoard',
      } : null,
      offChainCapital > 0 ? {
        tag: 'Bridge watch',
        title: `$${offChainCapital.toLocaleString('en-US', { maximumFractionDigits: 0 })} still sits on Ethereum or Base`,
        body: 'There is still capital outside PulseChain if you want to watch new bridge arrivals.',
        meta: 'Cross-chain',
      } : null,
      largestHolding ? {
        tag: 'Concentration',
        title: `${largestHolding.symbol} is still the anchor position`,
        body: `${((largestHolding.value / Math.max(summary.totalValue, 1)) * 100).toFixed(1)}% of current net worth is concentrated in this coin.`,
        meta: 'Allocation',
      } : null,
    ].filter(Boolean) as Array<{ tag: string; title: string; body: string; meta: string }>;
  }, [currentAssets, currentTransactions, frontPagePortfolioRows, summary.totalValue, topHoldingCards]);

  const frontPageMarketStats = useMemo(() => {
    const totalVolume = topHoldingCards.reduce((sum, token) => sum + (token.volume24h || 0), 0);
    const pulseCoins = topHoldingCards.filter(token => token.id !== 'eHEX');
    const strongest = [...topHoldingCards]
      .filter(token => token.change24h != null)
      .sort((a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity))[0];
    const weakest = [...topHoldingCards]
      .filter(token => token.change24h != null)
      .sort((a, b) => (a.change24h ?? Infinity) - (b.change24h ?? Infinity))[0];

    return [
      {
        label: 'Core Pulse assets',
        value: `${pulseCoins.length}`,
        detail: 'PLS, PLSX, HEX, INC, PRVX',
      },
      {
        label: 'Tracked 24h volume',
        value: totalVolume > 0 ? `$${fmtCompact(totalVolume)}` : 'Syncing',
        detail: 'Across live core pairs',
      },
      {
        label: 'Strongest today',
        value: strongest ? strongest.symbol : 'Live',
        detail: strongest?.change24h != null ? `${strongest.change24h >= 0 ? '+' : ''}${strongest.change24h.toFixed(2)}%` : 'Waiting for market data',
      },
      {
        label: 'Needs attention',
        value: weakest ? weakest.symbol : 'Wallet',
        detail: weakest?.change24h != null ? `${weakest.change24h >= 0 ? '+' : ''}${weakest.change24h.toFixed(2)}%` : 'Paste one address to start',
      },
    ];
  }, [topHoldingCards]);

  const frontInfoCards = useMemo(() => [
    {
      label: 'On / Offramp',
      value: 'Move money in and out',
      detail: 'Start with a tiny test. Use known routes, confirm the token contract, then scale once the bridge or swap lands.',
      action: 'Bridge safely',
      href: 'https://bridge.pulsechain.com/',
      icon: ArrowLeftRight,
    },
    {
      label: 'PulseX',
      value: 'Swap and add liquidity',
      detail: 'Use PulseX for core PulseChain swaps, then watch price, volume, liquidity, and pair depth before you size up.',
      action: 'Open PulseX',
      href: 'https://app.pulsex.com/',
      icon: Droplets,
    },
    {
      label: 'Liberty Swap',
      value: 'Stablecoin routes',
      detail: 'Good onboarding cards should explain which stablecoin path is easiest, what network it starts on, and what lands on PulseChain.',
      action: 'Compare route',
      href: null,
      icon: ArrowRight,
    },
    {
      label: 'Hyperlane',
      value: 'Extra bridge paths',
      detail: 'Useful for cross-chain assets beyond the official bridge. Keep the UI focused on route, token, fee, and arrival chain.',
      action: 'Open Hyperlane',
      href: 'https://hyperlane.xyz/',
      icon: Layers,
    },
    {
      label: 'Volume / TVL',
      value: 'Liquidity context',
      detail: 'Show 24h volume, TVL, liquidity by pair, and where depth is thin so the portfolio screen explains the market around the wallet.',
      action: 'Pulse stats',
      href: 'https://www.pulsechainstats.com/',
      icon: BarChart2,
    },
    {
      label: 'HEX staking',
      value: 'Days, yield, shares',
      detail: 'Make stake cards about days remaining, T-shares, accrued HEX, emergency end-stake risk, and current USD/PLS value.',
      action: 'View stakes',
      href: null,
      icon: Lock,
      tab: 'stakes' as ActiveTab,
    },
  ], []);

  const openMarketWatch = (initialSearch = '') => {
    setMarketWatchInitialSearch(initialSearch);
    setShowMarketWatch(true);
  };

  const runHomeSearch = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    if (/^\d+$/.test(q)) {
      window.open(`https://scan.pulsechain.com/block/${q}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (/^0x[a-fA-F0-9]{64}$/.test(q)) {
      window.open(`https://scan.pulsechain.com/tx/${q}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
      window.open(`https://scan.pulsechain.com/address/${q}`, '_blank', 'noopener,noreferrer');
      return;
    }
    openMarketWatch(q);
  };

  const {
    navItems,
    pageMeta,
    mobilePrimaryNavItems,
    mobileMoreNavItems,
    mobileMoreActive,
  } = buildAppShellController(activeTab);

  return (
    <div className="app-shell min-h-screen font-sans flex" style={{ fontSize: 14, color: 'var(--fg)' }}>
      {/* -- SIDEBAR BACKDROP (mobile) -- */}
      <div className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      {/* -- SIDEBAR -- */}
      <aside style={{
          width: 208, minWidth: 208,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
        }}
        className={`app-sidebar app-sidebar-panel flex flex-col sticky top-0 h-screen${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)' }} className="flex items-center gap-2.5">
          <div style={{
            width: 34, height: 34,
            background: 'rgba(0,214,143,0.08)',
            borderRadius: 11,
            border: '1px solid rgba(0,214,143,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <img src={BRAND_ASSETS.logo} alt="Pulseport logo" style={{ width: 18, height: 18 }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span className="app-brand-wordmark">PulsePort</span>
          </div>
        </div>

        <div className="sidebar-main-scroll custom-scrollbar">
          {/* Nav */}
          <nav style={{ padding: '8px 8px 6px' }} className="flex flex-col gap-0.5">
            {navItems.map(({ id, label, icon: Icon }) => {
              const isDefi = id === 'defi';
              const isActive = activeTab === id;
              const defiColor = 'rgba(247,57,255,0.9)';
              const defiDim   = 'rgba(247,57,255,0.08)';
              const defiLine  = '#f739ff';
              return (
                <button key={id} onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
                  className={`app-nav-item${isActive ? ' nav-item-active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 10,
                    background: isActive ? (isDefi ? defiDim : 'rgba(255,255,255,0.04)') : 'transparent',
                    color: isActive ? (isDefi ? defiColor : 'var(--accent)') : 'var(--fg-muted)',
                    fontWeight: isActive ? 700 : 600,
                    fontSize: 12.5, border: '1px solid transparent', cursor: 'pointer',
                    transition: 'all .15s', width: '100%', textAlign: 'left',
                    borderLeft: isActive ? `2px solid ${isDefi ? defiLine : 'var(--accent)'}` : '2px solid transparent',
                  }}
                  onMouseOver={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg)'; } }}
                  onMouseOut={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; } }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Wallets section */}
        <div className="sidebar-wallet-zone" style={{ padding: '8px 8px 0' }}>
          <button
            onClick={() => setSidebarWalletsOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 10px', borderRadius: 10,
              background: 'transparent', color: 'var(--fg-muted)',
              fontSize: 12.5, border: 'none', cursor: 'pointer', transition: 'all .15s',
            }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--fg)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <WalletIcon size={16} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Wallets</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '1px 7px', borderRadius: 100, border: '1px solid var(--accent-border)' }}>{wallets.length}</span>
              {sidebarWalletsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </div>
          </button>
          {sidebarWalletsOpen && (
            <div style={{ paddingBottom: 8 }}>
              {wallets.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedWalletAddr('all');
                    setActiveWallet(null);
                    setActiveTab('overview');
                    setSidebarOpen(false);
                  }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: 8,
                    background: selectedWalletAddr === 'all' && activeWallet === null ? 'var(--accent-dim)' : 'transparent',
                    border: `1px solid ${selectedWalletAddr === 'all' && activeWallet === null ? 'var(--accent-border)' : 'transparent'}`,
                    color: selectedWalletAddr === 'all' && activeWallet === null ? 'var(--accent)' : 'var(--fg)',
                    cursor: 'pointer', transition: 'all .12s', marginBottom: 4,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700 }}>
                    <span className="wallet-dot wallet-dot-multi" />
                    All wallets
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-subtle)', fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                    ${currentAssets.reduce((sum, asset) => sum + asset.value, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </button>
              )}
              <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 180, padding: '2px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {wallets.map((w, wIdx) => {
                  const dotColors = ['#00FF9F','#f739ff','#627EEA','#f97316','#a855f7','#f59e0b'];
                  const isActive = selectedWalletAddr === w.address.toLowerCase() && activeTab === 'overview';
                  const walletKey = w.address.toLowerCase();
                  const walletValue = (walletAssets[walletKey] || []).reduce((sum, asset) => sum + asset.value, 0);
                  return (
                    <div key={w.address}
                      onClick={() => { setSelectedWalletAddr(w.address.toLowerCase()); setActiveWallet(w.address); setActiveTab('overview'); setSidebarOpen(false); }}
                      style={{
                        padding: '7px 10px', borderRadius: 8,
                        background: isActive ? 'var(--accent-dim)' : 'transparent',
                        border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
                        cursor: 'pointer', transition: 'all .12s',
                      }}
                      className="group flex items-center justify-between"
                      onMouseOver={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
                      onMouseOut={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColors[wIdx % dotColors.length], flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <code style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{w.address.slice(0,6)}...{w.address.slice(-4)}</code>
                            <span style={{ fontSize: 10, color: isActive ? 'var(--accent)' : 'var(--fg-subtle)', fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                              {walletValue > 0 ? `$${walletValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '$0'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="touch-visible-actions opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={e => { e.stopPropagation(); setEditingWalletAddress(w.address); setEditWalletName(w.name); }}
                          style={{ color: 'var(--fg-muted)', padding: 3, cursor: 'pointer', border: 'none', background: 'none', borderRadius: 4 }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-muted)')}>
                          <Pencil size={10} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeWallet(w.address); }}
                          style={{ color: 'var(--fg-muted)', padding: 3, cursor: 'pointer', border: 'none', background: 'none', borderRadius: 4 }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--negative)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-muted)')}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {wallets.length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--fg-subtle)', fontStyle: 'italic' }}>No wallets added yet</div>
                )}
              </div>
              <div style={{ padding: '4px 2px 8px' }}>
                <button onClick={() => setIsAddingWallet(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, fontSize: 12,
                    border: '1px solid var(--accent-border)', borderRadius: 8, padding: '8px 0', cursor: 'pointer',
                    transition: 'all .15s', width: '100%',
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,255,159,.18)'; }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)'; }}>
                  <Plus size={13} /> Add Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* -- MAIN -- */}
      <main className="app-main flex-1 min-w-0 flex flex-col">
        {/* Top Nav / Header */}
        <header
          className="glass app-header shrink-0"
          style={{
            background: 'var(--bg-header)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, zIndex: 50,
            padding: '10px 16px',
          }}>
          <div className="app-header-main">
            <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
              <button className="sidebar-toggle md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
                <Menu size={16} />
              </button>
              <div style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                {pageMeta[activeTab].title}
              </div>
            </div>

            <div className="app-header-actions">
              <div className="hidden sm:flex items-center gap-2">
                <div className={`status-dot ${lastUpdated ? 'status-dot-live' : ''}`} />
                {lastUpdated && (
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {timeSinceLastUpdate}s ago
                  </span>
                )}
              </div>

              <button
                onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                className="theme-toggle"
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>

              <button onClick={() => { setApiKeyInput(etherscanApiKey); setIsApiKeyModalOpen(true); }}
                title={etherscanApiKey ? 'API key set' : 'Set Etherscan API key'}
                aria-label={etherscanApiKey ? 'API key set. Open API key settings' : 'Open API key settings'}
                className="header-action-btn"
                style={etherscanApiKey ? {
                  background: 'var(--accent-dim)',
                  borderColor: 'var(--accent-border)',
                  color: 'var(--accent)',
                } : {}}>
                {etherscanApiKey ? <Check size={12} /> : <Settings size={12} />}
                <span>{etherscanApiKey ? 'API set' : 'API'}</span>
              </button>

              <button onClick={fetchPortfolio}
                className={`header-action-btn${isLoading ? ' btn-loading' : ''}`}
                style={{ color: 'var(--fg)' }}>
                <RefreshCcw size={12} className={isLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-16 md:pb-0">
          <div className="app-content-shell space-y-5">

          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="premium-home">
                <section className="premium-home-hero">
                  <div className="premium-home-stack">
                    <div className="premium-home-value-card">
                      <span className="premium-home-kicker">My Net Worth</span>
                      <strong>${summary.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                      <small>
                        {summary.netInvestment > MIN_INVESTMENT_THRESHOLD
                          ? `Invested fiat $${Math.abs(summary.netInvestment).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                          : 'Add a wallet to map invested fiat against PulseChain holdings'}
                      </small>
                      <div className="premium-home-stat-grid">
                        <div>
                          <span>Net P&L</span>
                          <strong className={summary.unifiedPnl >= 0 ? 'is-up' : 'is-down'}>
                            {summary.netInvestment > MIN_INVESTMENT_THRESHOLD
                              ? `${summary.unifiedPnl >= 0 ? '+' : '-'}$${Math.abs(summary.unifiedPnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                              : '-'}
                          </strong>
                          {summary.netInvestment > MIN_INVESTMENT_THRESHOLD && (
                            <small className="premium-home-stat-note">
                              {summary.unifiedPnl >= 0 ? '+' : '-'}{Math.abs((summary.unifiedPnl / summary.netInvestment) * 100).toFixed(1)}% vs invested
                            </small>
                          )}
                        </div>
                        <div>
                          <span>24h move</span>
                          <strong className={summary.pnl24h >= 0 ? 'is-up' : 'is-down'}>
                            {summary.pnl24h >= 0 ? '+' : '-'}${Math.abs(summary.pnl24h).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </strong>
                        </div>
                        <div>
                          <span>Liquid</span>
                          <strong>${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                        </div>
                        <div>
                          <span>Staked</span>
                          <strong>${summary.stakingValueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                        </div>
                      </div>
                      <div className="premium-home-actions">
                        <button className="btn-primary front-primary-action" onClick={() => setActiveTab('pulsechain-official')}>
                          My Investments <ArrowRight size={15} />
                        </button>
                        <button className="btn-ghost front-secondary-action" onClick={() => setActiveTab('history')}>
                          Transactions <History size={14} />
                        </button>
                        <button className="btn-ghost front-secondary-action" onClick={() => setProfitPlannerOpen(true)}>
                          Profit Planner <TrendingUp size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="premium-home-panel premium-home-panel--allocation">
                      <div className="premium-home-panel-head">
                        <div>
                          <span>Portfolio mix</span>
                          <h2>Weight, concentration, and dominant positions.</h2>
                        </div>
                      </div>
                      {(() => {
                        const allocationColors = ['#00d68f', '#7c5cff', '#f739ff', '#fb923c', '#60a5fa', '#94a3b8'];
                        const allocationRows = frontPagePortfolioRows.slice(0, 5);
                        const otherValue = Math.max(0, frontPagePortfolioRows.slice(5).reduce((sum, asset) => sum + asset.value, 0));
                        const totalValue = Math.max(summary.totalValue, allocationRows.reduce((sum, asset) => sum + asset.value, 0) + otherValue);
                        const allocationData = [
                          ...allocationRows.map((asset, index) => ({
                            label: asset.symbol,
                            detail: asset.name,
                            value: asset.value,
                            color: allocationColors[index % allocationColors.length],
                          })),
                          ...(otherValue > 0 ? [{ label: 'Other', detail: 'Remaining holdings', value: otherValue, color: allocationColors[5] }] : []),
                        ];

                        return (
                          <>
                            {allocationData[0] ? (
                              <div className="front-allocation-hero">
                                <div className="front-allocation-hero__copy">
                                  <span>Largest position</span>
                                  <strong>{allocationData[0].label}</strong>
                                  <small>{allocationData[0].detail}</small>
                                </div>
                                <div className="front-allocation-hero__value">
                                  <strong>${allocationData[0].value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                                  <small>{((allocationData[0].value / totalValue) * 100).toFixed(1)}% of net worth</small>
                                </div>
                              </div>
                            ) : null}
                            <div className="front-allocation-stack">
                              {allocationData.map((entry) => {
                                const share = totalValue > 0 ? (entry.value / totalValue) * 100 : 0;
                                return (
                                  <div className="front-allocation-band" key={entry.label}>
                                    <div className="front-allocation-band__rail">
                                      <div className="front-allocation-band__fill" style={{ width: `${Math.max(share, 6)}%`, background: entry.color }} />
                                    </div>
                                    <div className="front-allocation-band__meta">
                                      <strong>{entry.label}</strong>
                                      <small>{entry.detail}</small>
                                    </div>
                                    <div className="front-allocation-band__value">
                                      <strong>${entry.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                                      <small>{share.toFixed(1)}%</small>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="premium-home-market">
                    <div className="premium-home-panel-head premium-home-panel-head--market">
                      <div>
                        <span>PulseBoard</span>
                        <h2>Core PulseChain price grid</h2>
                      </div>
                      <div className="front-time-tabs">
                        {FRONT_MARKET_PERIODS.map(label => (
                          <button
                            type="button"
                            key={label}
                            className={frontMarketPeriod === label ? 'active' : ''}
                            onClick={() => setFrontMarketPeriod(label)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="front-price-grid front-price-grid--premium">
                      {frontPageGridTokens.slice(0, 8).map((token, i) => {
                        const changeClass = (token.change24h ?? 0) >= 0 ? 'is-up' : 'is-down';
                        return (
                          <button
                            key={`${token.id}-${i}`}
                            className="front-price-box"
                            onClick={() => openMarketWatch(token.symbol)}
                            style={{ animationDelay: `${i * 32}ms` }}
                          >
                            <span className="front-price-accent" style={{ background: token.accent }} />
                            <span className="front-price-head">
                              <span className="front-price-topline">
                                <span className="front-token-logo">{token.logo ? <img src={token.logo} alt={token.symbol} /> : token.symbol.slice(0, 1)}</span>
                                <span>
                                  <strong>{token.symbol}</strong>
                                  <small>{token.name}</small>
                                </span>
                              </span>
                              <small className={`front-price-chip ${changeClass}`}>
                                {token.change24h == null ? 'Live' : `${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}% ${frontMarketPeriod}`}
                              </small>
                            </span>
                            <span className="front-price-main">
                              <strong>{fmtPrice(token.price)}</strong>
                              <small>PulseChain market</small>
                            </span>
                            <span className="front-price-footer">
                              <span className="front-price-stat">
                                <small>Market cap</small>
                                <strong>{fmtMarket(token.marketCap)}</strong>
                              </span>
                              <span className="front-price-stat">
                                <small>Volume 24h</small>
                                <strong>{fmtMarket(token.volume24h)}</strong>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <PulseBoardFeed items={frontPagePulseTips} />
                  </div>
                </section>

                <section className="premium-home-lower premium-home-lower--single">
                  <div className="premium-home-panel premium-home-panel--intel">
                    <div className="premium-home-panel-head">
                      <div>
                        <span>Market pulse</span>
                        <h2>What matters across the chain right now.</h2>
                      </div>
                    </div>
                    <div className="front-pulse-grid">
                      {frontPageMarketStats.map(stat => (
                        <div className="front-pulse-stat" key={stat.label}>
                          <span>{stat.label}</span>
                          <strong>{stat.value}</strong>
                          <small>{stat.detail}</small>
                        </div>
                      ))}
                    </div>
                    <div className="front-chain-stack">
                      {frontPageChainRows.map(row => {
                        const pct = summary.totalValue > 0 ? (row.value / summary.totalValue) * 100 : row.value;
                        const chainColor = CHAIN_COLORS[row.chain] || 'var(--accent)';
                        return (
                          <div className="front-chain-row" key={row.chain}>
                            <div>
                              <span style={{ background: chainColor }} />
                              <strong>{row.chain.charAt(0).toUpperCase() + row.chain.slice(1)}</strong>
                            </div>
                            <small>{Math.max(0, pct).toFixed(1)}%</small>
                            <em><i style={{ width: `${Math.min(100, Math.max(4, pct))}%`, background: chainColor }} /></em>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overview-page-shell space-y-4" style={{ width: '100%', minWidth: 1 }}>

                {/* -- ONBOARDING -- */}
                {wallets.length === 0 && (
                  <div className={theme === 'dark' ? 'hero-bg-dark' : 'hero-bg-light'} style={{ border: '1px solid var(--accent-border)', borderRadius: 20, padding: '40px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, var(--accent-glow) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(99,70,255,.06) 0%, transparent 50%)', pointerEvents: 'none' }} />
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 24px var(--accent-glow)' }}>
                      <WalletIcon size={24} color="var(--accent)" />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg)', marginBottom: 8, letterSpacing: '-0.02em' }}>Welcome to PulsePort</div>
                    <div style={{ fontSize: 14, color: 'var(--fg-muted)', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
                      Track your PulseChain, Ethereum, and Base portfolios in real time. Add your first wallet to get started.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 36, flexWrap: 'wrap' }}>
                      {[
                        { step: '1', label: 'Add wallet address', Icon: KeyRound },
                        { step: '2', label: 'Sync your balances', Icon: Zap },
                        { step: '3', label: 'View your portfolio', Icon: BarChart2 },
                      ].map(({ step, label, Icon }) => (
                        <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <div className="onboarding-step-icon"><Icon size={20} /></div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Step {step}</div>
                          <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setIsAddingWallet(true)}
                      className="btn-primary"
                      style={{ padding: '14px 36px', fontSize: 15 }}>
                      Add Your First Wallet {'->'}
                    </button>
                  </div>
                )}

                {/* -- HERO CARD (full width) with Allocation inside + STAT ROW -- */}
                {(() => {
                   return (
                     <>
                    <div className={`hero-card overview-hero-card overview-hero-frame ${theme === 'dark' ? 'hero-bg-dark' : 'hero-bg-light'}`}>
                      {/* Top edge glow */}
                      <div className="overview-hero-frame-glow" />
                      <div className="overview-hero-frame-wash" />
                      <div className="hero-grid overview-hero-grid">
                          <div className="hero-grid-top">
                         {/* Left: Portfolio Value + Stats */}
                         <div>
                           <div className="overview-kicker">My Net Worth</div>
                           <div className="overview-hero-value-row">
                             <div className="value-hero gradient-text-green">
                               ${summary.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                             </div>
                             <div className="overview-hero-native">
                               <div className={`hero-change-pill ${summary.pnl24h >= 0 ? 'up' : 'down'}`}>
                                 {summary.pnl24h >= 0 ? '+' : '-'}${Math.abs(summary.pnl24h).toLocaleString('en-US', { maximumFractionDigits: 0 })} / {summary.pnl24h >= 0 ? '+' : '-'}{summary.pnl24hPercent.toFixed(2)}%
                               </div>
                               <div className="overview-hero-native-copy">{summary.nativeValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS tracked</div>
                             </div>
                           </div>
                           {/* Compact stats */}
                           <div className="overview-hero-divider" />
                           <div className="overview-hero-strip">
                             <span className="overview-hero-pill">Liquid <strong>${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
                             <span className="overview-hero-pill">Staked <strong>${summary.stakingValueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
                             {wallets.length > 0 ? (() => {
                               const HEX_A = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
                               const totalPHex = currentAssets.filter(a => a.chain === 'pulsechain' && (a as any).address?.toLowerCase() === HEX_A).reduce((s, a) => s + a.balance, 0)
                                              + currentStakes.filter(s => s.chain === 'pulsechain' && (s.daysRemaining ?? 0) > 0).reduce((s, st) => s + (st.stakedHex ?? 0), 0);
                               const totalEHex = currentAssets.filter(a => (a.chain === 'ethereum' && (a as any).address?.toLowerCase() === HEX_A) || (a.chain === 'pulsechain' && a.symbol === 'eHEX')).reduce((s, a) => s + a.balance, 0)
                                              + currentStakes.filter(s => s.chain === 'ethereum' && (s.daysRemaining ?? 0) > 0).reduce((s, st) => s + (st.stakedHex ?? 0), 0);
                               return <>
                                <span className="overview-hero-pill">pHEX <strong className="overview-hero-pill__value overview-hero-pill__value--pulse">{totalPHex >= 1e6 ? `${(totalPHex/1e6).toFixed(1)}M` : totalPHex >= 1e3 ? `${(totalPHex/1e3).toFixed(0)}K` : Math.round(totalPHex).toLocaleString('en-US')}</strong></span>
                                <span className="overview-hero-pill">eHEX <strong className="overview-hero-pill__value overview-hero-pill__value--eth">{totalEHex >= 1e6 ? `${(totalEHex/1e6).toFixed(1)}M` : totalEHex >= 1e3 ? `${(totalEHex/1e3).toFixed(0)}K` : Math.round(totalEHex).toLocaleString('en-US')}</strong></span>
                              </>;
                            })() : (
                              <button onClick={() => setIsAddingWallet(true)} className="overview-hero-add-wallet">
                                + Add Wallet
                              </button>
                            )}
                           </div>
                           <div className="overview-hero-divider" />
                           <div className="overview-stat-grid max-sm:grid-cols-1">
                             {[
                              { label: 'Tracked Capital', val: summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? `$${Math.abs(summary.netInvestment).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '-', sub: summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? 'ETH + stablecoin inflows' : 'No ETH/stable inflows found', color: t.text,
                                icon: <TrendingUp size={14} color={t.textMuted} />, iconBg: t.cardHigh, link: true },
                              { label: 'Total P&L', val: summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? `${summary.unifiedPnl >= 0 ? '+' : '-'}$${Math.abs(summary.unifiedPnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '-', sub: summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? `${summary.unifiedPnl >= 0 ? '+' : '-'}${Math.abs((summary.unifiedPnl / summary.netInvestment) * 100).toFixed(1)}% vs invested` : 'P&L % needs ETH/stable history', color: summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? (summary.unifiedPnl >= 0 ? t.green : t.red) : t.text,
                                icon: <ArrowUpRight size={14} color={summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? (summary.unifiedPnl >= 0 ? t.green : t.red) : t.textMuted} />, iconBg: summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? (summary.unifiedPnl >= 0 ? 'rgba(0,255,159,0.1)' : 'rgba(244,63,94,0.1)') : t.cardHigh, link: false },
                             ].map(({ label, val, sub, color, icon, iconBg, link }) => (
                               <div key={label} className="stat-card" onClick={link ? () => setActiveTab('history') : undefined}
                                 style={link ? { cursor: 'pointer' } : undefined}>
                                <div className="stat-card-head">
                                  <div className="stat-card-icon" style={{ background: iconBg }}>
                                    {icon}
                                  </div>
                                  <div className="stat-card-label">{label}</div>
                                  {link && <ExternalLink size={10} className="stat-card-link-icon" />}
                                </div>
                                 <div className="stat-card-value" style={{ color }}>{val}</div>
                                 <div className="stat-card-sub">{sub}</div>
                               </div>
                             ))}
                           </div>
                         </div>
                         {/* Profit Planner + Market Watch buttons */}
                         <div className="overview-hero-actions">
                           <button
                             onClick={() => setActiveTab('assets')}
                             className="overview-hero-action overview-hero-action--secondary"
                           >
                             <LayoutDashboard size={15} />
                             Open Holdings
                           </button>
                           <button
                             onClick={() => setActiveTab('history')}
                             className="overview-hero-action overview-hero-action--primary"
                           >
                             <History size={15} />
                             Transactions
                           </button>
                         </div>
                          </div>{/* end hero-grid-top */}
                       </div>{/* end hero-grid */}
                     </div>{/* end hero card */}
                     {/* -- MY HOLDINGS + LIVE PRICES - outside hero card -- */}
                         {(() => {
                           const MAX_HERO_HOLDINGS = 7;
                           const holdingAssets = [...currentAssets].sort((a, b) => b.value - a.value).slice(0, MAX_HERO_HOLDINGS);
                           const holdingDisplayAssets = normalizeHoldingAssets(holdingAssets);
                           const fmtBal = (b: number) =>
                             b >= 1e9 ? `${(b/1e9).toFixed(2)}B` :
                             b >= 1e6 ? `${(b/1e6).toFixed(2)}M` :
                             b >= 1e3 ? `${(b/1e3).toFixed(2)}K` :
                             b.toLocaleString('en-US', { maximumFractionDigits: 2 });
                           const fmtVal = (v: number) =>
                             v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` :
                             v >= 1e3 ? `$${(v/1e3).toFixed(2)}K` :
                             `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
                           const fmtMarket = (v?: number | null) =>
                             v == null ? '-' :
                             v >= 1e12 ? `$${(v/1e12).toFixed(2)}T` :
                             v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` :
                             v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` :
                             v >= 1e3 ? `$${(v/1e3).toFixed(1)}K` :
                             `$${v.toFixed(0)}`;
                           return (
                             <div className="hero-holdings-wrap">
                               <div className="hero-holdings-panel overview-section-card">
                                 {false && (
                                  <>
                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                   <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                     <span className="overview-section-title">Top 7 Holdings</span>
                                     {wallets.length > 0 && currentAssets.length > 0 && (
                                       <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Showing {holdingAssets.length} of {currentAssets.length}</span>
                                     )}
                                     {wallets.length > 0 && summary.liquidValue > 0 && (
                                       <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>
                                          -  ${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                       </span>
                                     )}
                                   </div>
                                   <button
                                     onClick={() => setActiveTab('assets')}
                                     style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                     View All <ChevronRight size={11} />
                                   </button>
                                 </div>

                                 <HoldingsTable
                                   assets={holdingDisplayAssets}
                                   allAssets={currentAssets}
                                   wallets={wallets}
                                   totalValueUsd={summary.totalValue}
                                   plsUsdPrice={prices['pulsechain']?.usd || 0}
                                   priceChangePeriod="24h"
                                   sortField={assetSortField as HoldingSortField}
                                   sortDir={assetSortDir}
                                   expandedIds={expandedAssetIds}
                                   tokenLogos={tokenLogos}
                                   emptyMessage="Add wallets to see holdings"
                                   currentTransactions={currentTransactions}
                                   manualEntries={manualEntries}
                                   chainColors={CHAIN_COLORS}
                                   tokenMarketData={tokenMarketData}
                                   staticLogos={STATIC_LOGOS}
                                   getTokenLogoUrl={getTokenLogoUrl}
                                   explorerUrl={explorerUrl}
                                   dexScreenerUrl={dexScreenerUrl}
                                   onSort={(field) => {
                                     if (assetSortField === field) setAssetSortDir(d => d === 'desc' ? 'asc' : 'desc');
                                     else { setAssetSortField(field); setAssetSortDir('desc'); }
                                   }}
                                   onToggleExpanded={(id) => setExpandedAssetIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                                   onOpenPnl={asset => setPnlAsset(asset)}
                                  onHide={hideToken}
                                   onSetEntry={(id, value) => setManualEntries(prev => ({ ...prev, [id]: value }))}
                                   onClearEntry={(id) => setManualEntries(prev => { const n = { ...prev }; delete n[id]; return n; })}
                                   onFilterByAsset={symbol => { setTxAssetFilter(symbol); setActiveTab('overview'); }}
                                   footerLabel="TOP HOLDINGS"
                                   footerValueUsd={holdingAssets.reduce((sum, asset) => sum + asset.value, 0)}
                                   shareBaseUsd={summary.totalValue}
                                 />
                                  </>
                                 )}
                                 {false && (holdingAssets.length === 0 ? (
                                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '28px 0', color: 'var(--fg-subtle)' }}>
                                     <WalletIcon size={28} style={{ opacity: 0.35 }} />
                                     <span style={{ fontSize: 13 }}>Add wallets to see holdings</span>
                                   </div>
                                 ) : (() => {
                                   const plsPriceUsd = prices['pulsechain']?.usd || 0;
                                   const ethPriceUsd = prices['ethereum']?.usd || 0;
                                   const fmtNative = (n: number) =>
                                     n >= 1e9 ? `${(n/1e9).toFixed(2)}B` :
                                     n >= 1e6 ? `${(n/1e6).toFixed(2)}M` :
                                     n >= 1e3 ? `${(n/1e3).toFixed(1)}K` :
                                     n >= 1 ? n.toFixed(2) :
                                     n >= 0.01 ? n.toFixed(4) :
                                     n.toFixed(6);
                                   return (
                                   <div className="hero-holdings-items">
                                     <div className="data-table-scroll">
                                       <table className="data-table hero-holdings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                         <thead>
                                           <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                                             {['Token', '24H', 'Value', '% of Portfolio'].map((label, i) => (
                                               <th key={i} style={{
                                                 padding: '10px 12px',
                                                 fontSize: 11,
                                                 fontWeight: 700,
                                                 color: 'var(--fg-subtle)',
                                                 textTransform: 'uppercase',
                                                 letterSpacing: '.5px',
                                                 textAlign: i === 0 ? 'left' : 'right',
                                                 whiteSpace: 'nowrap'
                                               }}>
                                                 {label}
                                               </th>
                                             ))}
                                           </tr>
                                         </thead>
                                         <tbody>
                                           {holdingAssets.map((asset) => {
                                             const pct = asset.priceChange24h ?? asset.pnl24h ?? null;
                                             const lowerAddress = asset.address?.toLowerCase?.() ?? '';
                                             const logo = STATIC_LOGOS[lowerAddress] || asset.logoUrl || tokenLogos[lowerAddress] || getTokenLogoUrl(asset);
                                             const share = ((asset.value / (summary.totalValue || 1)) * 100);
                                             const isEthChain = asset.chain === 'ethereum' || asset.chain === 'base';
                                             const nativePriceUsd = isEthChain ? ethPriceUsd : plsPriceUsd;
                                             const nativeSymbol = isEthChain ? 'ETH' : 'PLS';
                                             const nativePrice = asset.price > 0 && nativePriceUsd > 0 ? asset.price / nativePriceUsd : null;
                                             return (
                                               <tr
                                                 key={asset.id}
                                                 onClick={() => setTokenCardModal(asset)}
                                                 style={{ borderBottom: `1px solid ${t.borderLight}`, cursor: 'pointer' }}
                                                 onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                                                 onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                                 <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                                   <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                     <div style={{
                                                       width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                                       display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--fg)', flexShrink: 0, overflow: 'hidden'
                                                     }}>
                                                       {logo ? <img src={logo} alt={asset.symbol} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                                         onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden'); }} /> : null}
                                                       <span hidden={!!logo}>{asset.symbol[0]}</span>
                                                     </div>
                                                     <div style={{ minWidth: 0 }}>
                                                       <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                         <div title={asset.name || asset.symbol} style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                                           {asset.name || asset.symbol}
                                                         </div>
                                                         <button
                                                           type="button"
                                                           className="hero-holding-filter-btn"
                                                           title={`Filter transactions by ${asset.symbol}`}
                                                           onClick={(e) => {
                                                             e.stopPropagation();
                                                             setTxAssetFilter(asset.symbol);
                                                             setActiveTab('overview');
                                                           }}
                                                         >
                                                           <Filter size={10} />
                                                         </button>
                                                       </div>
                                                       <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                                                         <div style={{ width: 5, height: 5, borderRadius: '50%', background: CHAIN_COLORS[asset.chain] || '#555', flexShrink: 0 }} />
                                                         <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                                                           {asset.symbol}
                                                           {asset.price > 0 && (
                                                             <>
                                                               {'  -  '}
                                                               <PriceDisplay price={asset.price} />
                                                               {nativePrice !== null && (
                                                                 <span style={{ color: 'var(--fg-muted)' }}> / {fmtNative(nativePrice)} {nativeSymbol}</span>
                                                               )}
                                                             </>
                                                           )}
                                                         </span>
                                                       </div>
                                                     </div>
                                                   </div>
                                                 </td>
                                                 <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: (pct ?? 0) >= 0 ? t.green : t.red }}>
                                                   {pct !== null ? `${pct >= 0 ? '^' : 'v'} ${Math.abs(pct).toFixed(2)}%` : '-'}
                                                 </td>
                                                 <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                   <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{fmtVal(asset.value)}</div>
                                                   <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{fmtBal(asset.balance)} {asset.symbol}</div>
                                                 </td>
                                                 <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 96 }}>
                                                   <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 3 }}>{share.toFixed(1)}%</div>
                                                   <div style={{ height: 2, background: 'var(--border)', borderRadius: 1 }}>
                                                     <div style={{ height: '100%', width: `${Math.min(share, 100)}%`, background: 'var(--accent)', borderRadius: 1 }} />
                                                   </div>
                                                 </td>
                                               </tr>
                                             );
                                           })}
                                         </tbody>
                                       </table>
                                     </div>
                                   </div>
                                   );
                                 })())}

                {/* -- MY HEX HOLDINGS -- */}
                {(() => {
                  const HEX_ADDR = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
                  const pHexPrice = prices[`pulsechain:${HEX_ADDR}`]?.usd || prices['pulsechain:hex']?.usd || 0;
                  const eHexPrice = prices[`ethereum:${HEX_ADDR}`]?.usd || prices['hex']?.usd || 0;
                  const HEX_ADDR_LC = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
                  // pHEX liquid: native HEX on PulseChain (symbol HEX, same address as eHEX contract but on PLS chain)
                  const pHexLiquid = currentAssets.filter(a => a.chain === 'pulsechain' && (a as any).address?.toLowerCase() === HEX_ADDR_LC).reduce((s, a) => s + a.balance, 0);
                  // Staked = principal + accrued yield (recalculated at chain-specific rate, never from stale cache)
                  let pHexPrincipal = 0, pHexYield = 0;
                  currentStakes.filter(s => s.chain === 'pulsechain').forEach(st => {
                    const principal  = st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8;
                    const tSharesVal = st.tShares    ?? Number(st.stakeShares  ?? 0n) / 1e12;
                    const daysStaked = Math.max(0, (st.stakedDays ?? 0) - (st.daysRemaining ?? 0));
                    const interest   = tSharesVal * daysStaked * PHEX_YIELD_PER_TSHARE;
                    pHexPrincipal += principal;
                    pHexYield     += interest;
                  });
                  const pHexStaked = pHexPrincipal + pHexYield;
                  // eHEX liquid: HEX on Ethereum + bridged eHEX on PulseChain
                  const eHexLiquidEth = currentAssets.filter(a => a.chain === 'ethereum' && (a as any).address?.toLowerCase() === HEX_ADDR_LC).reduce((s, a) => s + a.balance, 0);
                  const eHexLiquidPls = currentAssets.filter(a => a.chain === 'pulsechain' && a.symbol === 'eHEX').reduce((s, a) => s + a.balance, 0);
                  const eHexLiquid = eHexLiquidEth + eHexLiquidPls;
                  let eHexPrincipal = 0, eHexYield = 0;
                  currentStakes.filter(s => s.chain === 'ethereum').forEach(st => {
                    const principal  = st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8;
                    const tSharesVal = st.tShares    ?? Number(st.stakeShares  ?? 0n) / 1e12;
                    const daysStaked = Math.max(0, (st.stakedDays ?? 0) - (st.daysRemaining ?? 0));
                    const interest   = tSharesVal * daysStaked * EHEX_YIELD_PER_TSHARE;
                    eHexPrincipal += principal;
                    eHexYield     += interest;
                  });
                  const eHexStaked = eHexPrincipal + eHexYield;
                  const pHexTotal = pHexLiquid + pHexStaked;
                  const eHexTotal = eHexLiquid + eHexStaked;
                  // Space-separated thousands: 148 000 000
                  const boxes = [
                    { label: 'Total pHEX', sub: `${fmtBigNum(pHexLiquid)} liquid  -  ${fmtBigNum(pHexStaked)} staked`, val: fmtBigNum(pHexTotal), usd: pHexTotal * pHexPrice, color: '#fb923c', dot: '#fb923c' },
                    { label: 'Total eHEX', sub: `${fmtBigNum(eHexLiquid)} liquid  -  ${fmtBigNum(eHexStaked)} staked`, val: fmtBigNum(eHexTotal), usd: eHexTotal * eHexPrice, color: '#627EEA', dot: '#627EEA' },
                  ];
                  return (
                    <div className="hero-hex-holdings-section overview-section-card">
                      <div className={`overview-panel-header ${isCollapsed('hex-boxes') ? '' : 'overview-panel-header--divided'}`}>
                        <div className="overview-panel-heading">
                          <span className="overview-panel-kicker">HEX Positioning</span>
                          <div className="overview-section-title">My HEX Holdings</div>
                        </div>
                        <button
                          onClick={() => toggleSection('hex-boxes')}
                          className="overview-panel-toggle"
                          aria-label={isCollapsed('hex-boxes') ? 'Expand HEX holdings' : 'Collapse HEX holdings'}
                          aria-expanded={!isCollapsed('hex-boxes')}
                          title={isCollapsed('hex-boxes') ? 'Expand' : 'Collapse'}
                        >
                          {isCollapsed('hex-boxes') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </button>
                      </div>
                      {!isCollapsed('hex-boxes') && (
                        <>
                        <div className="overview-hex-grid max-sm:grid-cols-1">
                          {boxes.map(b => (
                            <div key={b.label} className="overview-hex-card">
                              <div className="overview-hex-card-head">
                                <div className="overview-hex-card-dot" style={{ background: b.dot }} />
                                <span className="overview-hex-card-label">{b.label}</span>
                              </div>
                              <div className="overview-hex-card-value" style={{ color: b.color }}>{b.val}</div>
                              {b.usd !== null && <div className="overview-hex-card-usd">${b.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>}
                              <div className="overview-hex-card-sub">{b.sub}</div>
                            </div>
                          ))}
                        </div>
                        {/* -- Stake Principal + Yield Breakdown -- */}
                        {(pHexPrincipal > 0 || eHexPrincipal > 0) && (
                          <div className="overview-hex-breakdown">
                            <div className="overview-hex-breakdown-label">Stake Breakdown - Principal + Accrued Yield</div>
                            <div className="overview-hex-breakdown-grid max-sm:grid-cols-1">
                              {[
                                { label: 'pHEX Staked', principal: pHexPrincipal, yield: pHexYield, total: pHexStaked, color: '#fb923c', usdPrice: pHexPrice },
                                { label: 'eHEX Staked', principal: eHexPrincipal, yield: eHexYield, total: eHexStaked, color: '#627EEA', usdPrice: eHexPrice },
                              ].filter(r => r.principal > 0 || r.yield > 0).map(r => (
                                <div key={r.label} className="overview-hex-breakdown-card">
                                  <div className="overview-hex-breakdown-title" style={{ color: r.color }}>{r.label}</div>
                                  <div className="overview-hex-breakdown-rows">
                                    <div className="overview-hex-breakdown-row">
                                      <span>Principal</span>
                                      <strong>{fmtBigNum(r.principal)}</strong>
                                    </div>
                                    <div className="overview-hex-breakdown-row">
                                      <span>Accrued Yield</span>
                                      <strong className="overview-hex-breakdown-yield">+{fmtBigNum(r.yield)}</strong>
                                    </div>
                                    <div className="overview-hex-breakdown-separator" />
                                    <div className="overview-hex-breakdown-row">
                                      <span className="overview-hex-breakdown-total-label">Total</span>
                                      <div className="overview-hex-breakdown-total">
                                        <div style={{ color: r.color }}>{fmtBigNum(r.total)}</div>
                                        <div>${(r.total * r.usdPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </>
                      )}
                    </div>
                  );
                })()}
                               </div>

                <div className="premium-home-lower premium-home-lower--portfolio">
                  <div className="premium-home-holdings">
                    <div className="premium-home-panel-head">
                      <div>
                        <span>My Holdings</span>
                        <h2>{wallets.length > 0 ? 'Current bag' : 'Add a wallet to build your bag view'}</h2>
                      </div>
                      <button className="front-inline-link" onClick={() => wallets.length > 0 ? setOverviewTokenSearch('') : setIsAddingWallet(true)}>
                        {wallets.length > 0 ? 'Scan holdings' : 'Add wallet'} <ChevronRight size={14} />
                      </button>
                    </div>
                    <CoinList
                      items={frontPageCoinItems}
                      variant="compact"
                      onRowClick={(item) => setOverviewTokenSearch(item.symbol)}
                      emptyMessage="No holdings yet."
                    />
                  </div>

                    <div className="premium-home-panel premium-home-panel--moves">
                      <div className="premium-home-panel-head">
                        <div>
                          <span>Command deck</span>
                          <h2>Open the tools that matter right now.</h2>
                        </div>
                        <button className="front-inline-link" onClick={() => openMarketWatch('')}>
                          Open market watch <ChevronRight size={14} />
                        </button>
                      </div>
                      <MyInvestmentsUtilityStrip
                        swapPnl24hUsd={swapPnl24hUsd}
                        swapCount24h={swapTransactions24h.length}
                        trackedMarkets={trackedMarketCount}
                        onOpenMarketWatch={() => openMarketWatch('')}
                        onOpenPlanner={() => setProfitPlannerOpen(true)}
                        onOpenTransactions={() => setActiveTab('history')}
                      />
                    </div>
                  </div>

                {/* -- PORTFOLIO PERFORMANCE -- */}
                {(() => {
                  const now = Date.now();
                  const cutoffs: Record<string, number> = {
                    '1w': now - 7 * 24 * 3600 * 1000,
                    '1m': now - 30 * 24 * 3600 * 1000,
                    '1y': now - 365 * 24 * 3600 * 1000,
                    'all': 0,
                  };
                  const cutoff = cutoffs[perfPeriod];
                  const realHistory = (wallets.length > 0 ? history : []).filter(p => p.timestamp >= cutoff);
                  const currentVal = summary.totalValue || 1;

                  // Deduplicate by period-appropriate bucket, keeping latest value + timestamp per bucket
                  const byBucket = new Map<string, { value: number; ts: number }>();
                  realHistory.forEach(p => {
                    const key = perfPeriod === '1w' ? format(p.timestamp, 'yyyy-MM-dd HH') : format(p.timestamp, 'yyyy-MM-dd');
                    byBucket.set(key, { value: p.value, ts: p.timestamp });
                  });
                  const uniquePts = [...byBucket.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([, { value, ts }]) => ({ day: fmtLabel(ts), value }));

                  let chartPoints: { day: string; value: number }[];

                  if (uniquePts.length >= 3) {
                    chartPoints = uniquePts;
                  } else {
                    chartPoints = uniquePts.length > 0
                      ? uniquePts
                      : [{ day: 'Now', value: currentVal }];
                  }

                  const periodChange = chartPoints.length >= 2
                    ? ((chartPoints[chartPoints.length - 1].value - chartPoints[0].value) / Math.max(1, chartPoints[0].value)) * 100
                    : 0;

                  const periodLabel: Record<string, string> = { '1w': 'Week', '1m': 'Month', '1y': 'Year', 'all': 'All' };
                  const xTickCount = perfPeriod === '1w' ? 7 : perfPeriod === '1m' ? 6 : 8;
                  const xInterval = Math.max(0, Math.floor(chartPoints.length / xTickCount) - 1);

                  const yMin = Math.min(...chartPoints.map(p => p.value));
                  const yMax = Math.max(...chartPoints.map(p => p.value));
                  const yPad = (yMax - yMin) * 0.1 || yMax * 0.1;
                  const fmtYAxis = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;

                  return (
                    <div className="overview-section-card overview-performance-panel">
                      <div className={`overview-panel-header ${isCollapsed('perf-chart') ? '' : 'overview-panel-header--divided'}`}>
                        <div className="overview-performance-head">
                          <div className="overview-section-title">Portfolio Performance</div>
                          <div className="overview-performance-delta" style={{ color: periodChange >= 0 ? t.green : t.red }}>
                            {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
                          </div>
                        </div>
                        <div className="overview-performance-actions">
                          {/* Period tabs */}
                          {!isCollapsed('perf-chart') && (
                            <div className="overview-performance-tabs">
                              {(['1w','1m','1y','all'] as const).map(p => (
                                <button key={p} onClick={() => setPerfPeriod(p)} className={`overview-performance-tab ${perfPeriod === p ? 'is-active' : ''}`}>
                                  {periodLabel[p]}
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => toggleSection('perf-chart')}
                            className="overview-panel-toggle"
                            aria-label={isCollapsed('perf-chart') ? 'Expand portfolio performance' : 'Collapse portfolio performance'}
                            aria-expanded={!isCollapsed('perf-chart')}
                            title={isCollapsed('perf-chart') ? 'Expand' : 'Collapse'}
                          >
                            {isCollapsed('perf-chart') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </button>
                        </div>
                      </div>
                      {!isCollapsed('perf-chart') && (
                        <div className="overview-performance-body">
                          <div className="overview-performance-chart">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={50}>
                              <AreaChart data={chartPoints} margin={{ top: 4, right: 18, left: 0, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.22}/>
                                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e1e1e' : '#e8e8e8'} vertical={false} />
                                <XAxis dataKey="day" stroke={theme === 'dark' ? '#333' : '#ccc'} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: t.textSecondary }} interval={xInterval} />
                                <YAxis width={54} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: t.textSecondary }} tickFormatter={fmtYAxis} domain={[yMin - yPad, yMax + yPad]} />
                                <RechartsTooltip
                                  contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 13, color: t.text }}
                                  formatter={(v: any) => [`$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, 'Portfolio Value']}
                                  labelStyle={{ color: t.textSecondary, marginBottom: 4 }}
                                />
                                <Area type="monotone" dataKey="value" stroke="var(--accent)" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                              </div>
                            );
                          })()}

                {/* -- LIQUIDITY POSITIONS STRIP (overview) -- */}
                {wallets.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <LiquidityOverviewStrip
                      walletAddresses={wallets.map(w => w.address)}
                      tokenPrices={tokenPrices}
                      onViewAll={() => setActiveTab('defi')}
                    />
                  </div>
                )}

                    </>
                  );
                })()}

              </motion.div>
            )}

            {activeTab === 'defi' && (
              <motion.div key="defi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <LiquiditySection
                  walletAddresses={wallets.map(w => w.address)}
                  tokenPrices={tokenPrices}
                />
              </motion.div>
            )}

            {activeTab === 'assets' && (
              <motion.div key="assets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="portfolio-page-shell space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {(() => {
                  const selectedScope = selectedWalletAddr === 'all' ? null : wallets.find(w => w.address.toLowerCase() === selectedWalletAddr);
                  const visibleWalletAssets = selectedScope ? (walletAssets[selectedWalletAddr] || []) : currentAssets;
                  const selectedWalletStakes = selectedScope ? currentStakes.filter(s => s.walletAddress === selectedWalletAddr) : currentStakes;
                  const selectedLiquidUsd = visibleWalletAssets.reduce((sum, asset) => sum + asset.value, 0);
                  const selectedStakingUsd = selectedWalletStakes.reduce((sum, st) => {
                    if ((st.daysRemaining ?? 0) <= 0) return sum; // exclude ended stakes
                    const hexPriceKey = `${st.chain}:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39`;
                    const chainHexFallback = st.chain === 'pulsechain' ? prices['pulsechain:hex']?.usd : prices['hex']?.usd;
                    const hexPrice = prices[hexPriceKey]?.usd || chainHexFallback || 0;
                    const stakedHex = st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8;
                    const tShares = st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12;
                    const daysStaked = Math.max(0, (st.stakedDays ?? 0) - (st.daysRemaining ?? 0));
                    const rate = st.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
                    return sum + (stakedHex + tShares * daysStaked * rate) * hexPrice;
                  }, 0);
                  const selectedTotalUsd = selectedLiquidUsd + selectedStakingUsd;
                  const chainAssets = walletChainFilter === 'all' ? currentAssets : currentAssets.filter(a => a.chain === walletChainFilter);
                  const chainDisplayAssets = normalizeHoldingAssets(chainAssets);
                  const hiddenChainAssets = walletChainFilter === 'all' ? hiddenAssetRows : hiddenAssetRows.filter(a => a.chain === walletChainFilter);
                  return (<>

                {/* -- Wallet scope + management banner -- */}
                <div className="portfolio-wallet-banner portfolio-wallet-banner--premium">
                  <div className="portfolio-wallet-head">
                    <div className="portfolio-wallet-copy">
                      <div className="portfolio-wallet-kicker">
                        {selectedScope ? selectedScope.name : 'All Wallets'}
                      </div>
                      {selectedScope && (
                        <div className="portfolio-wallet-address">
                          {selectedScope.address.slice(0, 10)}...{selectedScope.address.slice(-8)}
                        </div>
                      )}
                    </div>
                    <div className="portfolio-wallet-actions">
                      {selectedScope && (
                        <>
                          <button className="btn-ghost portfolio-wallet-action" onClick={() => navigator.clipboard.writeText(selectedScope.address)}>
                            <Copy size={13} /> Copy
                          </button>
                          <button className="btn-ghost portfolio-wallet-action" onClick={() => { setEditingWalletAddress(selectedScope.address); setEditWalletName(selectedScope.name); }}>
                            <Pencil size={13} /> Rename
                          </button>
                        </>
                      )}
                      <button className="btn-primary portfolio-wallet-action portfolio-wallet-action--primary" onClick={() => setIsAddingWallet(true)}>
                        <Plus size={13} /> Add Wallet
                      </button>
                    </div>
                  </div>
                  <div className="portfolio-wallet-value">
                    ${(selectedScope ? selectedTotalUsd : summary.totalValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="portfolio-wallet-summary">
                    <span className="wallet-stat-pill-green">
                      Liquid ${(selectedScope ? selectedLiquidUsd : summary.liquidValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="portfolio-wallet-pill portfolio-wallet-pill--staking" style={{ color: t.red }}>
                      Staking ${(selectedScope ? selectedStakingUsd : summary.stakingValueUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="portfolio-wallet-pill">
                      {visibleWalletAssets.length} token{visibleWalletAssets.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="wallet-selector-bar portfolio-wallet-selector">
                    <button
                      className={`wallet-pill${selectedWalletAddr === 'all' ? ' active' : ''}`}
                      onClick={() => { setSelectedWalletAddr('all'); setActiveWallet(null); }}
                    >
                      <span className="wallet-dot wallet-dot-multi" />
                      All
                    </button>
                    {wallets.map((wallet, idx) => {
                      const walletKey = wallet.address.toLowerCase();
                      const isWalletActive = selectedWalletAddr === walletKey;
                      const dotColor = WALLET_DOT_COLORS[idx % WALLET_DOT_COLORS.length];
                      const walletValue = (walletAssets[walletKey] || []).reduce((sum, asset) => sum + asset.value, 0);
                      return (
                        <button
                          key={wallet.address}
                          className={`wallet-pill${isWalletActive ? ' active' : ''}`}
                          title={wallet.address}
                          onClick={() => { setSelectedWalletAddr(walletKey); setActiveWallet(wallet.address); }}
                          style={isWalletActive ? { background: `${dotColor}1a`, borderColor: `${dotColor}55`, color: dotColor } : undefined}
                        >
                          <span className="wallet-dot" style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}bb` }} />
                          <span>{wallet.name || shortenAddr(wallet.address)}</span>
                          <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>${walletValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="portfolio-chain-filter-row">
                    {(['all', 'pulsechain', 'ethereum', 'base'] as const).map(c => (
                      <button key={c} onClick={() => setWalletChainFilter(c)}
                        className={`filter-pill${walletChainFilter === c ? ' active' : ''}`}>
                        {c === 'all' ? 'All' : c === 'pulsechain' ? 'PulseChain' : c === 'ethereum' ? 'Ethereum' : 'Base'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`coin-visibility-panel${coinVisibilityMenuOpen ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="coin-visibility-trigger"
                    onClick={() => setCoinVisibilityMenuOpen(v => !v)}
                    aria-expanded={coinVisibilityMenuOpen}
                  >
                    <div className="coin-visibility-copy">
                      <span>Coin visibility</span>
                      <strong>Wallet coins are auto-detected on refresh.</strong>
                      <small>
                        Open filters, hidden coins, manual coins, and spam scan controls.
                      </small>
                    </div>
                    <div className="coin-visibility-stats">
                      <span>{hiddenTokens.length} hidden</span>
                      <span>{customCoins.length} manual</span>
                      <span>{hideDust ? 'Dust hidden' : 'Dust visible'}</span>
                      <span>{hideSpam ? 'Spam hidden' : 'Spam visible'}</span>
                    </div>
                    <ChevronDown size={16} className="coin-visibility-chevron" />
                  </button>
                  {coinVisibilityMenuOpen && (
                    <div className="coin-visibility-dropdown-panel">
                      <div className="coin-visibility-actions">
                        <button type="button" onClick={fetchPortfolio}>
                          <RefreshCcw size={13} className={isLoading ? 'animate-spin' : ''} />
                          Refresh / detect
                        </button>
                        <button type="button" onClick={() => setShowHiddenCoins(v => !v)}>
                          <Eye size={13} />
                          {showHiddenCoins ? 'Close hidden coins' : 'Open hidden coins'}
                          {hiddenTokens.length > 0 && <span className="hidden-coins-count">{hiddenTokens.length}</span>}
                        </button>
                        <button type="button" className="coin-visibility-primary" onClick={() => setIsCustomCoinsModalOpen(true)}>
                          <Plus size={13} />
                          Add coin
                        </button>
                        <button type="button" onClick={scanForSpam} disabled={isScanning || wallets.length === 0}>
                          <Shield size={13} />
                          {isScanning ? 'Scanning...' : 'Scan spam'}
                          {scanResult !== null && !isScanning && (
                            <span className="hidden-coins-count">{scanResult > 0 ? `+${scanResult}` : 'clean'}</span>
                          )}
                        </button>
                      </div>
                      <div className="coin-visibility-dropdown">
                        <button type="button" onClick={() => setHideDust(v => !v)}>
                          <span>{hideDust ? 'Show dust coins' : 'Hide dust coins'}</span>
                          <small>{hideDust ? 'Dust filter is on' : 'Dust filter is off'}</small>
                        </button>
                        <button type="button" onClick={() => setHideSpam(v => !v)}>
                          <span>{hideSpam ? 'Show spam coins' : 'Hide spam coins'}</span>
                          <small>{hideSpam ? 'Spam filter is on' : 'Spam filter is off'}</small>
                        </button>
                        <button type="button" disabled={hiddenTokens.length === 0} onClick={() => { setHiddenTokens([]); setShowHiddenCoins(false); }}>
                          <span>Unhide all manual coins</span>
                          <small>Restore every hidden coin</small>
                        </button>
                        <button type="button" onClick={() => { setHideDust(false); setHideSpam(false); setShowHiddenCoins(true); }}>
                          <span>Show everything</span>
                          <small>Turn off filters and open hidden list</small>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Header row */}
                <div className="portfolio-section-topbar">
                  <div className="portfolio-section-heading">
                    <div className="portfolio-section-title">Holdings</div>
                    <div className="portfolio-section-subtitle">{chainAssets.length} token{chainAssets.length !== 1 ? 's' : ''}  -  ${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} liquid</div>
                  </div>
                  <div className="portfolio-section-actions">
                    <div className="portfolio-period-switch">
                      {([['1h','1H'],['6h','6H'],['24h','24H'],['7d','7D']] as const).map(([p, label]) => (
                        <button key={p} onClick={() => setPriceChangePeriod(p)} className={`portfolio-period-button ${priceChangePeriod === p ? 'is-active' : ''}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Token Table */}
                <div className="portfolio-holdings-shell md-elevation-1" style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div className={`portfolio-panel-header ${isCollapsed('assets-table') ? '' : 'portfolio-panel-header--divided'}`}>
                    <div className="portfolio-panel-heading">
                      <div className="portfolio-panel-title">Assets</div>
                      <div className="portfolio-panel-subtitle">{chainAssets.length} tokens  -  ${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="portfolio-panel-actions">
                      <button
                        type="button"
                        onClick={() => setAllocationCalculatorOpen(v => !v)}
                        className={`portfolio-inline-action ${allocationCalculatorOpen ? 'is-active' : ''}`}
                      >
                        <Calculator size={13} />
                        {allocationCalculatorOpen ? 'Close Calculator' : 'Open Calculator'}
                      </button>
                      <button
                        onClick={() => toggleSection('assets-table')}
                        className="overview-panel-toggle"
                        aria-label={isCollapsed('assets-table') ? 'Expand assets table' : 'Collapse assets table'}
                        aria-expanded={!isCollapsed('assets-table')}
                        title={isCollapsed('assets-table') ? 'Expand' : 'Collapse'}
                      >
                        {isCollapsed('assets-table') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                      </button>
                    </div>
                  </div>
                  {!isCollapsed('assets-table') && (<>
                  {allocationCalculatorOpen && (
                    <div style={{ margin: '0 16px 16px', padding: '16px 18px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.cardHigh, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Adjust Allocation</div>
                        <div style={{ fontSize: 12, color: t.textSecondary }}>
                          Total: {allocationCalculatorRows.reduce((sum, r) => sum + r.percent, 0).toFixed(1)}%
                        </div>
                      </div>
                      {allocationCalculatorRows.length > 0 ? allocationCalculatorRows.map((row, i) => (
                        <div key={row.name} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px 80px', alignItems: 'center', gap: 10 }} className="max-sm:grid-cols-1">
                          <span style={{ fontSize: 13, color: t.text }}>{row.name}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.percent}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setAllocationDraftPercentages(prev => ({ ...prev, [row.name]: next }));
                            }}
                            style={{ accentColor: ['#00FF9F','#627EEA','#f97316','#a855f7','#f59e0b','#06b6d4','#ec4899'][i % 7] }}
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.percent.toFixed(1)}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (!Number.isFinite(next)) return;
                              setAllocationDraftPercentages(prev => ({ ...prev, [row.name]: Math.min(100, Math.max(0, next)) }));
                            }}
                            style={{ width: '100%', background: t.card, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em' }}
                          />
                          <span style={{ fontSize: 12, color: t.textSecondary, textAlign: 'right', fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                            ${row.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )) : (
                        <div style={{ fontSize: 13, color: t.textMuted }}>No holdings available for allocation calculator.</div>
                      )}
                    </div>
                  )}
                  <HoldingsTable
                    assets={chainDisplayAssets}
                    allAssets={currentAssets}
                    wallets={wallets}
                    totalValueUsd={summary.totalValue}
                    plsUsdPrice={prices['pulsechain']?.usd || 0}
                    priceChangePeriod={priceChangePeriod}
                    sortField={assetSortField as HoldingSortField}
                    sortDir={assetSortDir}
                    expandedIds={expandedAssetIds}
                    tokenLogos={tokenLogos}
                    emptyMessage="No holdings found - add wallets to get started"
                    currentTransactions={currentTransactions}
                    manualEntries={manualEntries}
                    chainColors={CHAIN_COLORS}
                    tokenMarketData={tokenMarketData}
                    staticLogos={STATIC_LOGOS}
                    getTokenLogoUrl={getTokenLogoUrl}
                    explorerUrl={explorerUrl}
                    dexScreenerUrl={dexScreenerUrl}
                    onSort={(field) => {
                      if (assetSortField === field) setAssetSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      else { setAssetSortField(field); setAssetSortDir('desc'); }
                    }}
                    onToggleExpanded={(id) => setExpandedAssetIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                    onOpenPnl={asset => setPnlAsset(asset)}
                    onHide={hideToken}
                    onSetEntry={(id, value) => setManualEntries(prev => ({ ...prev, [id]: value }))}
                    onClearEntry={(id) => setManualEntries(prev => { const n = { ...prev }; delete n[id]; return n; })}
                    onFilterByAsset={symbol => { resetHistoryFilters(); setTxAssetFilter(symbol); setActiveTab('history'); }}
                    showSkeleton={isLoading && wallets.length > 0 && currentAssets.length === 0}
                    footerValueUsd={chainAssets.reduce((sum, asset) => sum + asset.value, 0)}
                    shareBaseUsd={summary.totalValue}
                  />
                  {false && <div className="data-table-scroll">
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                          {[
                            { label: 'Token', field: null, align: 'left' },
                            { label: priceChangePeriod.toUpperCase(), field: 'change', align: 'right' },
                            { label: 'Value', field: 'value', align: 'right' },
                            { label: '% of Portfolio', field: null, align: 'right' },
                            { label: '', field: null, align: 'right' },
                          ].map(({ label, field, align }, i) => (
                            <th key={i} onClick={field ? () => {
                              if (assetSortField === field) setAssetSortDir(d => d === 'desc' ? 'asc' : 'desc');
                              else { setAssetSortField(field as any); setAssetSortDir('desc'); }
                            } : undefined}
                              style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600,
                                color: assetSortField === field ? t.green : t.textSecondary,
                                textTransform: 'uppercase', letterSpacing: '.5px',
                                textAlign: align as any, whiteSpace: 'nowrap', background: t.card,
                                cursor: field ? 'pointer' : 'default', userSelect: 'none' }}>
                              {label}{field && assetSortField === field ? (assetSortDir === 'desc' ? ' down' : ' up') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading && wallets.length > 0 && currentAssets.length === 0 && [...Array(5)].map((_, i) => (
                          <tr key={`skel-${i}`}>
                            <td style={{ padding: '13px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div className="skeleton" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
                                <div>
                                  <div className="skeleton" style={{ width: 80, height: 13, marginBottom: 5 }} />
                                  <div className="skeleton" style={{ width: 110, height: 11 }} />
                                </div>
                              </div>
                            </td>
                            {[...Array(4)].map((_, j) => (
                              <td key={j} style={{ padding: '13px 16px', textAlign: 'right' }}>
                                <div className="skeleton" style={{ height: 13, width: 60, marginLeft: 'auto' }} />
                              </td>
                            ))}
                          </tr>
                        ))}
                        {currentAssets.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 13 }}>
                              No holdings found - add wallets to get started
                            </td>
                          </tr>
                        ) : (
                          [...chainAssets].sort((a, b) => {
                            const getVal = (x: any) => assetSortField === 'change'
                              ? (priceChangePeriod === '1h' ? (x.priceChange1h ?? 0)
                                : priceChangePeriod === '7d' ? (x.priceChange7d ?? 0)
                                : (x.priceChange24h ?? x.pnl24h ?? 0))
                              : x.value;
                            const diff = getVal(b) - getVal(a);
                            return assetSortDir === 'desc' ? diff : -diff;
                          }).map((asset, idx) => {
                            const pct = priceChangePeriod === '1h' ? (asset.priceChange1h ?? 0)
                              : priceChangePeriod === '7d' ? (asset.priceChange7d ?? 0)
                              : priceChangePeriod === '6h' ? 0
                              : (asset.priceChange24h ?? asset.pnl24h ?? 0);
                            const share = ((asset.value / (summary.totalValue || 1)) * 100);
                            const addr = (asset as any).address;
                            const logo = STATIC_LOGOS[(asset as any).address?.toLowerCase?.()]
                              || tokenLogos[(asset as any).address?.toLowerCase?.()]
                              || (asset as any).logoUrl
                              || getTokenLogoUrl(asset);
                            const explUrl = explorerUrl(asset.chain, addr);
                            const dsUrl = dexScreenerUrl(asset.chain, addr);
                            const isExpanded = expandedAssetIds.has(asset.id);
                            const plsUsdPrice = prices['pulsechain']?.usd || 0.00005;
                            const priceInPls = asset.price > 0 && plsUsdPrice > 0 ? asset.price / plsUsdPrice : 0;
                            const entryPls = manualEntries[asset.id];
                            const currentPlsValue = asset.value / plsUsdPrice;
                            const pnlPls = entryPls ? currentPlsValue - entryPls : null;
                            const fmtBal = (b: number) =>
                              b >= 1e9 ? `${(b/1e9).toFixed(2)}B` :
                              b >= 1e6 ? `${(b/1e6).toFixed(2)}M` :
                              b >= 1e3 ? `${(b/1e3).toFixed(2)}K` :
                              b.toLocaleString('en-US', { maximumFractionDigits: 4 });
                            return (
                              <React.Fragment key={asset.id}>
                              <motion.tr
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(idx * 0.03, 0.5), duration: 0.2 }}
                                style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', transition: 'background .1s', borderLeft: `3px solid ${CHAIN_COLORS[asset.chain] || '#333'}`, cursor: 'pointer' }}
                                onClick={() => setExpandedAssetIds(prev => { const s = new Set(prev); s.has(asset.id) ? s.delete(asset.id) : s.add(asset.id); return s; })}
                                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                                onMouseOut={e => (e.currentTarget.style.background = isExpanded ? 'var(--bg-elevated)' : 'transparent')}>
                                {/* -- Token cell -- */}
                                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {/* Logo */}
                                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--fg)', flexShrink: 0, overflow: 'hidden' }}>
                                      {logo ? <img src={logo} alt={asset.symbol} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden'); }} /> : null}
                                      <span hidden={!!logo}>{asset.symbol[0]}</span>
                                    </div>
                                    {/* Name + subtitle */}
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{asset.name || asset.symbol}</span>
                                        {addr && addr !== 'native' && (
                                          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(addr); }}
                                            title={`Copy: ${addr}`}
                                            style={{ padding: '1px 3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', transition: 'color .12s', lineHeight: 1 }}
                                            onMouseOver={e => (e.currentTarget.style.color = '#aaa')}
                                            onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                            <Copy size={10} />
                                          </button>
                                        )}
                                        {dsUrl && addr !== 'native' && (
                                          <a href={dsUrl} target="_blank" rel="noopener noreferrer"
                                            title="DexScreener" onClick={e => e.stopPropagation()}
                                            style={{ padding: '1px 3px', color: 'var(--fg-subtle)', transition: 'color .12s', lineHeight: 1, display: 'inline-flex' }}
                                            onMouseOver={e => (e.currentTarget.style.color = '#f4c542')}
                                            onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                            <ExternalLink size={10} />
                                          </a>
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: CHAIN_COLORS[asset.chain] || '#555', flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                                          {asset.symbol}{asset.price > 0 && <>  -  <PriceDisplay price={asset.price} /></>}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {/* -- Change cell -- */}
                                <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap',
                                  fontSize: 13, fontWeight: 600, color: pct >= 0 ? t.green : t.red }}>
                                  {pct >= 0 ? '^' : 'v'} {Math.abs(pct).toFixed(2)}%
                                </td>
                                <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
                                    ${asset.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                  </div>
                                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                                    {fmtBal(asset.balance)} {asset.symbol}
                                  </div>
                                </td>
                                <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 90 }}>
                                  <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 3 }}>{share.toFixed(1)}%</div>
                                  <div style={{ height: 2, background: 'var(--border)', borderRadius: 1 }}>
                                    <div style={{ height: '100%', width: `${Math.min(share, 100)}%`, background: 'var(--accent)', borderRadius: 1 }} />
                                  </div>
                                </td>
                                <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                                    <button
                                      onClick={e => { e.stopPropagation(); setPnlAsset(pnlAsset?.id === asset.id ? null : asset); }}
                                      title="View P&L"
                                      style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', transition: 'color .12s',
                                        color: pnlAsset?.id === asset.id ? '#a78bfa' : '#555' }}
                                      onMouseOver={e => (e.currentTarget.style.color = '#a78bfa')}
                                      onMouseOut={e => (e.currentTarget.style.color = pnlAsset?.id === asset.id ? '#a78bfa' : '#555')}>
                                      <Calculator size={13} />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); hideToken(asset.id); }}
                                      style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', transition: 'color .12s' }}
                                      onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                      onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
                                      title="Hide">
                                      <Trash2 size={13} />
                                    </button>
                                    <span style={{ color: isExpanded ? t.green : 'var(--fg-subtle)', padding: 4, display: 'inline-flex', transition: 'color .12s' }}>
                                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                    </span>
                                  </div>
                                </td>
                              </motion.tr>
                              {/* -- Expanded details row -- */}
                              {isExpanded && (
                                <tr style={{ borderBottom: `1px solid ${t.borderLight}`, borderLeft: `3px solid ${CHAIN_COLORS[asset.chain] || '#333'}`, background: t.expandedBg }}>
                                  <td colSpan={5} style={{ padding: '0 16px 14px 16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, paddingTop: 12 }}>
                                      {/* Price details */}
                                      <div style={{ background: t.cardHigh, borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>Price Details</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>USD</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em' }}><PriceDisplay price={asset.price} /></span>
                                          </div>
                                          {priceInPls > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>in PLS</span>
                                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--chain-pulse)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em' }}>
                                                {priceInPls >= 1e6 ? `${(priceInPls/1e6).toFixed(2)}M` : priceInPls >= 1e3 ? `${(priceInPls/1e3).toFixed(2)}K` : priceInPls >= 1 ? priceInPls.toFixed(2) : priceInPls < 0.001 ? priceInPls.toFixed(8) : priceInPls.toFixed(6)} PLS
                                              </span>
                                            </div>
                                          )}
                                          {(asset.priceChange1h ?? null) !== null && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>1H</span>
                                              <span style={{ fontSize: 12, fontWeight: 700, color: (asset.priceChange1h ?? 0) >= 0 ? t.green : t.red }}>
                                                {(asset.priceChange1h ?? 0) >= 0 ? '^' : 'v'} {Math.abs(asset.priceChange1h ?? 0).toFixed(2)}%
                                              </span>
                                            </div>
                                          )}
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>24H</span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: (asset.priceChange24h ?? asset.pnl24h ?? 0) >= 0 ? t.green : t.red }}>
                                              {(asset.priceChange24h ?? asset.pnl24h ?? 0) >= 0 ? '^' : 'v'} {Math.abs(asset.priceChange24h ?? asset.pnl24h ?? 0).toFixed(2)}%
                                            </span>
                                          </div>
                                          {(asset.priceChange7d ?? null) !== null && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>7D</span>
                                              <span style={{ fontSize: 12, fontWeight: 700, color: (asset.priceChange7d ?? 0) >= 0 ? t.green : t.red }}>
                                                {(asset.priceChange7d ?? 0) >= 0 ? '^' : 'v'} {Math.abs(asset.priceChange7d ?? 0).toFixed(2)}%
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {/* Market Data */}
                                      <div style={{ background: t.cardHigh, borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>Market Data</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                          {(() => {
                                            const md = tokenMarketData[asset.id];
                                            const fmtNum = (n: number) => n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
                                            return (
                                              <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Native Price</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-shell-display)', letterSpacing: '-0.01em' }}>
                                                    {md?.nativePriceUsd ? `${parseFloat(md.nativePriceUsd).toFixed(4)}` : '-'}
                                                  </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Liquidity</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700, color: t.green }}>{md ? fmtNum(md.liquidity) : <span style={{ color: 'var(--fg-subtle)' }}>-</span>}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Volume 24h</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{md ? fmtNum(md.volume24h) : <span style={{ color: 'var(--fg-subtle)' }}>-</span>}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Pools</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)' }}>{md ? md.pools : <span style={{ color: 'var(--fg-subtle)' }}>-</span>}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Txns 24h</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)' }}>{md?.txns24h != null ? md.txns24h.toLocaleString() : <span style={{ color: 'var(--fg-subtle)' }}>-</span>}</span>
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                      {/* Holdings breakdown */}
                                      <div style={{ background: t.cardHigh, borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>Your Holdings</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Held</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                                              {asset.balance >= 1e6 ? `${(asset.balance/1e6).toFixed(2)}M` : asset.balance >= 1e3 ? `${(asset.balance/1e3).toFixed(2)}K` : asset.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} {asset.symbol}
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Value</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>${asset.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                                          </div>
                                          {priceInPls > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Value PLS</span>
                                              <span style={{ fontSize: 13, fontWeight: 600, color: '#f739ff' }}>
                                                {currentPlsValue >= 1e6 ? `${(currentPlsValue/1e6).toFixed(2)}M` : currentPlsValue >= 1e3 ? `${(currentPlsValue/1e3).toFixed(2)}K` : currentPlsValue.toFixed(0)} PLS
                                              </span>
                                            </div>
                                          )}
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>% of Portfolio</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)' }}>{share.toFixed(2)}%</span>
                                          </div>
                                        </div>
                                      </div>
                                      {/* PLS-denominated P&L */}
                                      <div style={{ background: t.cardHigh, borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                          <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.7px' }}>PLS P&L</div>
                                          {entryPls && entryPls > 0 && (
                                            <button onClick={e => { e.stopPropagation(); setManualEntries(prev => { const n = { ...prev }; delete n[asset.id]; return n; }); }}
                                              title="Clear entry"
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, display: 'flex', alignItems: 'center', transition: 'color .12s' }}
                                              onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                              onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                              <X size={13} />
                                            </button>
                                          )}
                                        </div>
                                        {pnlPls !== null ? (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Entry</span>
                                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)' }}>{(entryPls!).toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Now</span>
                                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{currentPlsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 2 }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)', fontWeight: 700 }}>Net P&L</span>
                                              <span style={{ fontSize: 14, fontWeight: 800, color: pnlPls >= 0 ? t.green : t.red }}>
                                                {pnlPls >= 0 ? '+' : ''}{pnlPls.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS
                                              </span>
                                            </div>
                                          </div>
                                        ) : (
                                          <div>
                                            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 8 }}>Set entry to track P&L</div>
                                            <input type="number" placeholder="Entry PLS amount"
                                              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: 12, padding: '5px 8px', outline: 'none' }}
                                              onClick={e => e.stopPropagation()}
                                              onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setManualEntries(prev => ({ ...prev, [asset.id]: v })); }} />
                                          </div>
                                        )}
                                      </div>
                                      {/* Links */}
                                      <div style={{ background: t.cardHigh, borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>Links & Info</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                          {addr && addr !== 'native' && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Contract</span>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ fontSize: 12, fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg-muted)' }}>{addr.slice(0,6)}...{addr.slice(-4)}</span>
                                                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(addr); }}
                                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2 }}
                                                  onMouseOver={e => (e.currentTarget.style.color = '#aaa')}
                                                  onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                                  <Copy size={11} />
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                          {explUrl && (
                                            <a href={explUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', transition: 'opacity .12s' }}
                                              onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                                              onMouseOut={e => (e.currentTarget.style.opacity = '1')}>
                                              <ExternalLink size={11} /> Explorer
                                            </a>
                                          )}
                                          {dsUrl && addr !== 'native' && (
                                            <a href={dsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#f4c542', textDecoration: 'none', transition: 'opacity .12s' }}
                                              onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                                              onMouseOut={e => (e.currentTarget.style.opacity = '1')}>
                                              <ExternalLink size={11} /> DexScreener
                                            </a>
                                          )}
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: CHAIN_COLORS[asset.chain] || '#555' }} />
                                            <span style={{ fontSize: 12, color: 'var(--fg-subtle)', textTransform: 'capitalize' }}>{asset.chain}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                      {currentAssets.length > 0 && (
                        <tfoot>
                          <tr style={{ borderTop: '1px solid var(--border)' }}>
                            <td colSpan={2} style={{ padding: '10px 16px', fontSize: 13, color: 'var(--fg-muted)', fontWeight: 600 }}>
                              TOTAL LIQUID
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                              ${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>}
                  {unpricedCount > 0 && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={12} /> {unpricedCount} token{unpricedCount !== 1 ? 's' : ''} with no price data omitted
                    </div>
                  )}
                  </>)}
                </div>

                {/* -- Transactions -- */}
                <div style={{ marginTop: 8 }}>
                  {/* Type filter pills + active filter chips */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {([
                      { value: 'all', label: 'All' },
                      { value: 'deposit', label: 'Received' },
                      { value: 'withdraw', label: 'Sent' },
                      { value: 'swap', label: 'Swaps' },
                      { value: 'interaction', label: 'Calls' },
                    ] as { value: string; label: string }[]).map(({ value, label }) => (
                      <button key={value}
                        onClick={() => setTxTypeFilter(value)}
                        className={`filter-pill${txTypeFilter === value ? ' active' : ''}`}>
                        {label}
                      </button>
                    ))}
                    {(txAssetFilter !== 'all' || txYearFilter !== 'all' || txCoinCategory !== 'all' || txChainFilter !== 'all') && (
                      <>
                        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
                        {txAssetFilter !== 'all' && (
                          <button className="filter-chip" onClick={() => setTxAssetFilter('all')}>
                            {txAssetFilter}<span className="chip-x">x</span>
                          </button>
                        )}
                        {txYearFilter !== 'all' && (
                          <button className="filter-chip" onClick={() => setTxYearFilter('all')}>
                            {txYearFilter}<span className="chip-x">x</span>
                          </button>
                        )}
                        {txCoinCategory !== 'all' && (
                          <button className="filter-chip" onClick={() => setTxCoinCategory('all')}>
                            {txCoinCategory === 'stablecoins' ? 'Stablecoins' : txCoinCategory === 'eth_weth' ? 'ETH/WETH' : txCoinCategory === 'hex' ? 'HEX/eHEX' : txCoinCategory === 'pls_wpls' ? 'PLS/WPLS' : 'Bridged'}<span className="chip-x">x</span>
                          </button>
                        )}
                        {txChainFilter !== 'all' && (
                          <button className="filter-chip" onClick={() => setTxChainFilter('all')}>
                            {txChainFilter}<span className="chip-x">x</span>
                          </button>
                        )}
                        <button
                          onClick={resetHistoryFilters}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', textDecoration: 'underline' }}>
                          Clear all
                        </button>
                      </>
                    )}
                  </div>

                  <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' }} className="md-elevation-1">
                    <div style={{ padding: '14px 18px', borderBottom: isCollapsed('holdings-txs') ? 'none' : `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Transactions</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                          {txChainFilter === 'all' ? 'All Chains' : txChainFilter}
                        </span>
                        <span style={{ fontSize: 12, color: t.textTertiary }}>{holdingsPulsechainTransactions.length} {txTypeFilter === 'all' ? 'tx' : txTypeFilter}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => setViewAsYou(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                          <div style={{ width: 36, height: 20, borderRadius: 10, background: viewAsYou ? 'var(--accent)' : 'var(--bg-elevated)', border: '1px solid var(--border)', transition: 'background .15s', position: 'relative', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: 2, left: viewAsYou ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                            View as <span style={{ color: 'var(--accent)' }}>You</span>
                          </span>
                        </button>
                        <button onClick={() => setTxCompact(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                          <div style={{ width: 36, height: 20, borderRadius: 10, background: txCompact ? 'var(--accent)' : 'var(--bg-elevated)', border: '1px solid var(--border)', transition: 'background .15s', position: 'relative', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: 2, left: txCompact ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>Compact</span>
                        </button>
                        <button
                          onClick={() => {
                            const { headers: hdrs, rows } = buildTransactionExportRows(holdingsPulsechainTransactions);
                            exportCSV(`pulseport-history-${Date.now()}.csv`, hdrs, rows);
                          }}
                          title="Export CSV"
                          className="history-csv-btn"
                          style={{ padding: '5px 10px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Download size={12} /> CSV
                        </button>
                        <button
                          onClick={() => {
                            const json = buildTransactionExportJson(holdingsPulsechainTransactions);
                            const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `pulseport-history-${Date.now()}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          title="Export JSON"
                          className="history-csv-btn"
                          style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--fg)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <Download size={12} /> JSON
                        </button>
                        <button onClick={() => toggleSection('holdings-txs')}
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: t.textTertiary, transition: 'color .12s', flexShrink: 0 }}
                          onMouseOver={e => (e.currentTarget.style.color = t.text)}
                          onMouseOut={e => (e.currentTarget.style.color = t.textMuted)}
                          title={isCollapsed('holdings-txs') ? 'Expand' : 'Collapse'}>
                          {isCollapsed('holdings-txs') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </button>
                      </div>
                    </div>
                    {!isCollapsed('holdings-txs') && (<>
                    {/* Filter row */}
                    <div className="tx-filter-row history-filter-row" style={{ padding: '8px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { value: txAssetFilter, onChange: setTxAssetFilter, options: swapAssetFilterOptions },
                        { value: txYearFilter, onChange: setTxYearFilter, options: swapYearFilterOptions },
                        { value: txChainFilter, onChange: setTxChainFilter, options: [['all','All Chains'],['pulsechain','PulseChain'],['ethereum','Ethereum'],['base','Base']] as [string,string][] },
                        { value: txCoinCategory, onChange: setTxCoinCategory, options: [['all','All Coins'],['stablecoins','Stablecoins'],['eth_weth','ETH/WETH'],['hex','HEX/eHEX'],['pls_wpls','PLS/WPLS'],['bridged','Bridged']] as [string,string][] },
                      ].map(({ value, onChange, options }, i) => (
                        <select key={i} value={value} onChange={e => onChange(e.target.value)}
                          className="history-filter-select"
                          style={{ background: t.cardHigh, border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, fontSize: 13, padding: '5px 10px', cursor: 'pointer', outline: 'none' }}>
                          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ))}
                    </div>
                    {/* Active filter chips */}
                    {(txAssetFilter !== 'all' || txYearFilter !== 'all' || txCoinCategory !== 'all' || txChainFilter !== 'all') && (
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '8px 18px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>Filtering by:</span>
                        {txAssetFilter !== 'all' && (<button className="filter-chip" onClick={() => setTxAssetFilter('all')}>{txAssetFilter}<span className="chip-x">&#x2715;</span></button>)}
                        {txYearFilter !== 'all' && (<button className="filter-chip" onClick={() => setTxYearFilter('all')}>{txYearFilter}<span className="chip-x">&#x2715;</span></button>)}
                        {txChainFilter !== 'all' && (<button className="filter-chip" onClick={() => setTxChainFilter('all')}>{txChainFilter}<span className="chip-x">&#x2715;</span></button>)}
                        {txCoinCategory !== 'all' && (<button className="filter-chip" onClick={() => setTxCoinCategory('all')}>{txCoinCategory === 'stablecoins' ? 'Stablecoins' : txCoinCategory === 'eth_weth' ? 'ETH/WETH' : txCoinCategory === 'hex' ? 'HEX/eHEX' : txCoinCategory === 'pls_wpls' ? 'PLS/WPLS' : 'Bridged'}<span className="chip-x">&#x2715;</span></button>)}
                <button onClick={resetHistoryFilters} style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', textDecoration: 'underline', marginLeft: 4 }}>Clear all</button>
                      </div>
                    )}
                    {/* -- Wallet-style transaction cards -- */}
                    <div className="custom-scrollbar tx-module-list wallet-tx-list">
                      <TransactionList
                        transactions={holdingsPulsechainTransactions}
                        viewAsYou={viewAsYou}
                        wallets={wallets}
                        compact={txCompact}
                        assets={currentAssets}
                        getTokenLogoUrl={getTokenLogoUrl}
                        tokenLogos={tokenLogos}
                        hideIds={hiddenTxIds}
                        onToggleHide={id => setHiddenTxIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                        showHidden={showHiddenTxs}
                        onFilterByAsset={symbol => { resetHistoryFilters(); setTxAssetFilter(symbol); }}
                        emptyMessage="No transactions found for these filters."
                        initialVisibleCount={150}
                        loadMoreCount={150}
                      />
                      {/* Hidden transactions bar */}
                      {hiddenTxIds.length > 0 && (
                        <div style={{ marginTop: 8, padding: '8px 0', borderTop: `1px solid ${t.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: t.textTertiary }}>{hiddenTxIds.length} hidden event{hiddenTxIds.length > 1 ? 's' : ''}</span>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setShowHiddenTxs(v => !v)} style={{ fontSize: 12, color: t.textSecondary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{showHiddenTxs ? 'Hide' : 'Show'}</button>
                            <button onClick={() => setHiddenTxIds([])} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
                          </div>
                        </div>
                      )}
                    </div>
                    </>)}
                  </div>
                </div>

                  </>);
                })()}
              </motion.div>
            )}

            {activeTab === 'stakes' && (
              <motion.div key="stakes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {(() => {
                  const HEX_ADDR = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
                  const pHexLiquid = currentAssets
                    .filter(a => a.chain === 'pulsechain' && (a as any).address?.toLowerCase() === HEX_ADDR)
                    .reduce((sum, asset) => sum + asset.balance, 0);
                  const eHexLiquid = currentAssets
                    .filter(a =>
                      (a.chain === 'ethereum' && (a as any).address?.toLowerCase() === HEX_ADDR) ||
                      (a.chain === 'pulsechain' && a.symbol.toLowerCase() === 'ehex')
                    )
                    .reduce((sum, asset) => sum + asset.balance, 0);
                  return (
                    <div className="stakes-page-shell">
                      <StakesSection
                        stakes={currentStakes}
                        hexUsdPrice={prices['pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39']?.usd || prices['pulsechain:hex']?.usd || 0}
                        phexUsdPrice={prices['pulsechain:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39']?.usd || prices['pulsechain:hex']?.usd || 0}
                        ehexUsdPrice={prices['ethereum:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39']?.usd || prices['hex']?.usd || 0}
                        liquidPHex={pHexLiquid}
                        liquidEHex={eHexLiquid}
                        walletAddresses={wallets.map(w => w.address)}
                        walletLabels={Object.fromEntries(wallets.filter(w => w.name).map(w => [w.address, w.name!]))}
                      />
                    </div>
                  );
                })()}
              </motion.div>
            )}


        {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="transaction-page-shell transaction-page-shell--reset space-y-4">
            <div className="transaction-page-head transaction-page-head--premium">
              <div className="transaction-page-head-main">
                <span className="transaction-page-kicker">Transactions</span>
                <h1 className="transaction-page-title">
                  {txAssetFilter === 'all'
                    ? `${txChainFilter === 'all' ? 'Cross-chain' : txChainFilter} ${txTypeFilter === 'all' ? 'Transaction' : txTypeFilter.charAt(0).toUpperCase() + txTypeFilter.slice(1)} Ledger`
                    : `${txAssetFilter} ${txTypeFilter === 'all' ? 'Transaction' : txTypeFilter.charAt(0).toUpperCase() + txTypeFilter.slice(1)} Ledger`}
                </h1>
                <p className="transaction-page-subtitle">
                  Review transaction flow by asset, chain, bridge route, and staking context without leaving the ledger.
                </p>
                <div className="transaction-page-chip-row">
                  <span className="tx-band-chip tx-band-chip--accent">{txTypeFilter === 'all' ? 'All transaction types' : `${txTypeFilter} only`}</span>
                  <span className="tx-band-chip">{selectedWalletAddr === 'all' ? 'All wallets' : shortenAddr(selectedWalletAddr)}</span>
                  <span className="tx-band-chip">{txChainFilter === 'all' ? 'All chains' : txChainFilter}</span>
                  <span className="tx-band-chip">{txYearFilter === 'all' ? 'All years' : txYearFilter}</span>
                  <span className="tx-band-chip">{txCoinCategory === 'all' ? 'All coin families' : txCoinCategory === 'stablecoins' ? 'Stablecoins' : txCoinCategory === 'eth_weth' ? 'ETH/WETH' : txCoinCategory === 'hex' ? 'HEX/eHEX' : txCoinCategory === 'pls_wpls' ? 'PLS/WPLS' : 'Bridged'}</span>
                  {txBridgeProtocolFilter !== 'all' && <span className="tx-band-chip">{txBridgeProtocolFilter} bridge</span>}
                  {txOriginChainFilter !== 'all' && <span className="tx-band-chip">origin {txOriginChainFilter}</span>}
                  {txStakingActionFilter !== 'all' && <span className="tx-band-chip">{txStakingActionFilter}</span>}
                </div>
              </div>
              <div className="transaction-page-head-side">
                <div className="transaction-page-stats">
                  <div className="transaction-page-stat">
                    <span>{txTypeFilter === 'all' ? 'Tracked transactions' : txTypeFilter === 'swap' ? 'Tracked swaps' : `Tracked ${txTypeFilter}s`}</span>
                    <strong>{filteredTransactions.length}</strong>
                  </div>
                  <div className="transaction-page-stat">
                    <span>Realized P&amp;L</span>
                    <strong style={{ color: historySummary.realizedPnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {historySummary.realizedPnl >= 0 ? '+' : '-'}${Math.abs(historySummary.realizedPnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="transaction-page-stat">
                    <span>Holdings value</span>
                    <strong>${historySummary.holdingsValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="transaction-page-stat">
                    <span>Gas total</span>
                    <strong>{historySummary.gasPls.toLocaleString('en-US', { maximumFractionDigits: 4 })} PLS</strong>
                    <small>${historySummary.gasUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</small>
                  </div>
                </div>
                <div className="transaction-page-head-actions">
                  <button type="button" className={`filter-pill${viewAsYou ? ' active' : ''}`} aria-pressed={viewAsYou} onClick={() => setViewAsYou(v => !v)}>
                    View as You
                  </button>
                  <button type="button" className={`filter-pill${txCompact ? ' active' : ''}`} aria-pressed={txCompact} onClick={() => setTxCompact(v => !v)}>
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { headers: hdrs, rows } = buildTransactionExportRows(filteredTransactions);
                      exportCSV(`pulseport-swaps-${Date.now()}.csv`, hdrs, rows);
                    }}
                    className="history-csv-btn"
                  >
                    <Download size={12} /> Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const json = buildTransactionExportJson(filteredTransactions);
                      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `pulseport-swaps-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="history-csv-btn"
                  >
                    <Download size={12} /> Export JSON
                  </button>
                </div>
              </div>
            </div>

            {txAssetFilter !== 'all' && (
              <div className="tx-context-strip">
                <div className="tx-context-title">
                  {activeHistoryAsset && (
                    <img
                      src={getTokenLogoUrl(activeHistoryAsset)}
                      alt={txAssetFilter}
                      className="tx-context-logo"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                    <div>
                    <strong>{txAssetFilter} {txTypeFilter === 'all' ? 'Transaction' : txTypeFilter.charAt(0).toUpperCase() + txTypeFilter.slice(1)} P&amp;L</strong>
                    <span>{historySummary.tokenTxs.length} {txTypeFilter === 'all' ? 'transaction' : txTypeFilter} rows tracked</span>
                  </div>
                </div>
                <div className="tx-context-metrics">
                  <div className="tx-context-metric">
                    <span>Realized P&amp;L</span>
                    <strong style={{ color: historySummary.realizedPnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {historySummary.realizedPnl >= 0 ? '+' : '-'}${Math.abs(historySummary.realizedPnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="tx-context-metric">
                    <span>Holdings</span>
                    <strong>${historySummary.holdingsValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="tx-context-metric">
                    <span>Gas</span>
                    <strong>{historySummary.gasPls.toLocaleString('en-US', { maximumFractionDigits: 4 })} PLS</strong>
                  </div>
                </div>
                <button type="button" className="tx-context-clear" onClick={resetHistoryFilters}>
                  Clear filter <X size={12} />
                </button>
              </div>
            )}

            <div className="transaction-ledger-shell transaction-ledger-shell--dense">
              <div className="tx-context-band">
                <div className="tx-band-chip-group">
                  <span className="tx-band-chip tx-band-chip--accent">{txTypeFilter === 'all' ? 'All transaction types' : `${txTypeFilter} only`}</span>
                  <span className="tx-band-chip">{selectedWalletAddr === 'all' ? 'All wallets' : shortenAddr(selectedWalletAddr)}</span>
                  <span className="tx-band-chip">{txAssetFilter === 'all' ? 'All tokens' : txAssetFilter}</span>
                  <span className="tx-band-chip">{txChainFilter === 'all' ? 'All chains' : txChainFilter}</span>
                  {txBridgeProtocolFilter !== 'all' && <span className="tx-band-chip">{txBridgeProtocolFilter} bridge</span>}
                  {txOriginChainFilter !== 'all' && <span className="tx-band-chip">origin {txOriginChainFilter}</span>}
                  {txStakingActionFilter !== 'all' && <span className="tx-band-chip">{txStakingActionFilter}</span>}
                </div>
                <div className="tx-band-metrics">
                  <div className="tx-band-metric">
                    <span>{txTypeFilter === 'all' ? 'Transactions' : txTypeFilter === 'swap' ? 'Swaps' : `${txTypeFilter.charAt(0).toUpperCase()}${txTypeFilter.slice(1)}s`}</span>
                    <strong>{filteredTransactions.length}</strong>
                  </div>
                  <div className="tx-band-metric">
                    <span>Realized P&amp;L</span>
                    <strong style={{ color: historySummary.realizedPnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {historySummary.realizedPnl >= 0 ? '+' : '-'}${Math.abs(historySummary.realizedPnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="tx-band-metric">
                    <span>Holdings</span>
                    <strong>${historySummary.holdingsValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="tx-band-metric">
                    <span>Gas total</span>
                    <strong>{historySummary.gasPls.toLocaleString('en-US', { maximumFractionDigits: 4 })} PLS</strong>
                    <small>${historySummary.gasUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</small>
                  </div>
                </div>
              </div>

              <div className="transaction-ledger-toolbar transaction-ledger-toolbar--dense">
                <div className="transaction-ledger-title">
                  <History size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div>
                    <strong>{txTypeFilter === 'all' ? 'History Ledger' : `${txTypeFilter.charAt(0).toUpperCase()}${txTypeFilter.slice(1)} Ledger`}</strong>
                    <span>Typed history drill-downs for asset, chain, bridge, and staking contexts.</span>
                  </div>
                </div>
                <span className="transaction-ledger-badge">{txChainFilter === 'all' ? 'Cross-chain' : txChainFilter}</span>
              </div>

              <div className="transaction-ledger-filters history-filter-row">
                {([
                  { id: 'asset', label: 'Token Scope', value: txAssetFilter, onChange: setTxAssetFilter, options: swapAssetFilterOptions },
                  { id: 'year', label: 'Execution Year', value: txYearFilter, onChange: setTxYearFilter, options: swapYearFilterOptions },
                  { id: 'chain', label: 'Chain', value: txChainFilter, onChange: setTxChainFilter, options: [['all', 'All Chains'], ['pulsechain', 'PulseChain'], ['ethereum', 'Ethereum'], ['base', 'Base']] as [string, string][] },
                  { id: 'category', label: 'Coin Family', value: txCoinCategory, onChange: setTxCoinCategory, options: [['all','All Coins'],['stablecoins','Stablecoins'],['eth_weth','ETH/WETH'],['hex','HEX/eHEX'],['pls_wpls','PLS/WPLS'],['bridged','Bridged']] as [string,string][] },
                ]).map(({ id, label, value, onChange, options }) => (
                  <label key={id} className="history-filter-control">
                    <span>{label}</span>
                    <select value={value} onChange={e => onChange(e.target.value)}
                      className="history-filter-select"
                      aria-label={label}>
                      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={resetHistoryFilters}
                  className="history-clear-btn"
                  disabled={!hasActiveSwapFilters}
                >
                  Clear all
                </button>
              </div>

              <div className="transaction-ledger-list custom-scrollbar">
                <TransactionList
                  transactions={filteredTransactions}
                  viewAsYou={viewAsYou}
                  wallets={wallets}
                  compact={txCompact}
                  assets={currentAssets}
                  getTokenLogoUrl={getTokenLogoUrl}
                  tokenLogos={tokenLogos}
                  hideIds={hiddenTxIds}
                  onToggleHide={id => setHiddenTxIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                  showHidden={showHiddenTxs}
                  onFilterByAsset={symbol => {
                    resetHistoryFilters();
                    setTxAssetFilter(symbol);
                  }}
                  emptyMessage={txTypeFilter === 'all' ? 'No transactions found for these filters.' : `No ${txTypeFilter}s found for these filters.`}
                  initialVisibleCount={150}
                  loadMoreCount={150}
                />
              </div>
            </div>


            {/* -- PLS Flow Summary (merged from former tracker tab) -- */}
            {plsSwapData.rows.length > 0 && (
              <div className="transaction-flow-panel">
                <div className={`overview-panel-header ${isCollapsed('history-pls') ? '' : 'overview-panel-header--divided'}`}>
                  <div className="overview-panel-heading">
                    <span className="overview-panel-kicker">Native Flow</span>
                    <div className="overview-section-title">PLS Flow</div>
                    <div className="transaction-flow-subtitle">Net PLS movement across all tracked wallets.</div>
                  </div>
                  <button
                    onClick={() => toggleSection('history-pls')}
                    className="overview-panel-toggle"
                    aria-label={isCollapsed('history-pls') ? 'Expand PLS flow' : 'Collapse PLS flow'}
                    aria-expanded={!isCollapsed('history-pls')}
                  >
                    {isCollapsed('history-pls') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                </div>
                {!isCollapsed('history-pls') && (
                  <div className="transaction-flow-grid stat-grid-4">
                    {[
                      { label: 'PLS Received', val: plsSwapData.totalReceived >= 1e6 ? `${(plsSwapData.totalReceived/1e6).toFixed(2)}M` : plsSwapData.totalReceived.toLocaleString('en-US',{maximumFractionDigits:0}), sub: 'Total inflow', color: t.green },
                      { label: 'PLS Spent', val: plsSwapData.totalSpent >= 1e6 ? `${(plsSwapData.totalSpent/1e6).toFixed(2)}M` : plsSwapData.totalSpent.toLocaleString('en-US',{maximumFractionDigits:0}), sub: 'Total outflow', color: t.red },
                      { label: 'Net PLS', val: `${plsSwapData.totalNet >= 0 ? '+' : ''}${Math.abs(plsSwapData.totalNet) >= 1e6 ? (plsSwapData.totalNet/1e6).toFixed(2)+'M' : plsSwapData.totalNet.toLocaleString('en-US',{maximumFractionDigits:0})}`, sub: 'Net balance', color: plsSwapData.totalNet >= 0 ? t.green : t.red },
                      { label: 'Net USD', val: `${plsSwapData.netUsd >= 0 ? '+' : ''}$${Math.abs(plsSwapData.netUsd).toLocaleString('en-US',{maximumFractionDigits:0})}`, sub: `@ $${(plsSwapData.plsPrice||0).toFixed(6)}/PLS`, color: plsSwapData.netUsd >= 0 ? t.green : t.red },
                    ].map(({ label, val, sub, color }) => (
                      <div key={label} className="transaction-flow-card">
                        <div className="transaction-flow-label">{label}</div>
                        <div className="transaction-flow-value" style={{ color }}>{val}</div>
                        <div className="transaction-flow-copy">{sub}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}


        {activeTab === 'wallets' && (() => {
          const isAll = selectedWalletAddr === 'all';
          const selWallet = wallets.find(w => w.address.toLowerCase() === selectedWalletAddr);

          const viewAssets = isAll
            ? currentAssets
            : (walletAssets[selectedWalletAddr] || []).filter(a => !hiddenTokens.includes(a.id) && !(a as any).isSpam);

          const viewStakes = isAll
            ? currentStakes
            : currentStakes.filter(s => s.walletAddress === selectedWalletAddr);

          const filteredViewAssets = walletChainFilter === 'all' ? viewAssets : viewAssets.filter(a => a.chain === walletChainFilter);
          const filteredDisplayAssets = normalizeHoldingAssets(filteredViewAssets);

          const walletUsdValue = viewAssets.reduce((s, a) => s + a.value, 0);
          // Recalculate staking value from first principles using live prices + accrued yield
          // (principal + interest earned so far), keeping this consistent with summary.stakingValueUsd
          // and the Overview HEX Holdings section. Using full maturity yield here would make the
          // Wallets total vastly higher than the Overview total for long-running stakes.
          const stakingUsdValue = viewStakes.reduce((s, st) => {
            if ((st.daysRemaining ?? 0) <= 0) return s; // exclude ended stakes
            const hexPriceKey = `${st.chain}:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39`;
            const chainHexFallback = st.chain === 'pulsechain' ? prices['pulsechain:hex']?.usd : prices['hex']?.usd;
            const hexPrice = prices[hexPriceKey]?.usd || chainHexFallback || 0;
            const stakedHex = st.stakedHex ?? Number(st.stakedHearts ?? 0n) / 1e8;
            const tShares = st.tShares ?? Number(st.stakeShares ?? 0n) / 1e12;
            const daysStaked = Math.max(0, (st.stakedDays ?? 0) - (st.daysRemaining ?? 0));
            const rate = st.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
            const accruedHex = stakedHex + tShares * daysStaked * rate;
            return s + accruedHex * hexPrice;
          }, 0);
          const totalUsdValue = walletUsdValue + stakingUsdValue;

          // pHEX / eHEX totals (matching overview hero)
          const HEX_A = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
          const walletPHex = viewAssets
            .filter(a => a.chain === 'pulsechain' && (a as any).address?.toLowerCase() === HEX_A)
            .reduce((s, a) => s + a.balance, 0)
            + viewStakes.filter(s => s.chain === 'pulsechain' && (s.daysRemaining ?? 0) > 0).reduce((s, st) => s + (st.stakedHex ?? 0), 0);
          const walletEHex = viewAssets
            .filter(a => (a.chain === 'ethereum' && (a as any).address?.toLowerCase() === HEX_A) || (a.chain === 'pulsechain' && a.symbol === 'eHEX'))
            .reduce((s, a) => s + a.balance, 0)
            + viewStakes.filter(s => s.chain === 'ethereum' && (s.daysRemaining ?? 0) > 0).reduce((s, st) => s + (st.stakedHex ?? 0), 0);
          const fmtHexCount = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : Math.round(n).toLocaleString('en-US');

          return (
            <motion.div key="wallets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="wallet-page-shell wallet-dashboard-shell space-y-4">
              <WalletSelector
                wallets={wallets.map(w => w.address.toLowerCase())}
                activeWallet={selectedWalletAddr === 'all' ? null : selectedWalletAddr}
                onSelect={(addr) => {
                  setSelectedWalletAddr(addr ? addr.toLowerCase() : 'all');
                  setActiveWallet(addr);
                }}
                onAdd={() => setIsAddingWallet(true)}
                walletLabels={Object.fromEntries(wallets.map(w => [w.address.toLowerCase(), w.name || shortenAddr(w.address)]))}
              />

              {/* Hero card */}
              <div className="wallet-hero-panel">
                <div className="wallet-hero-header">
                  <div className="wallet-hero-copy">
                    <div className="wallet-hero-eyebrow">{isAll ? 'Tracked wallets' : 'Tracked wallet'}</div>
                    <div className="wallet-hero-title">{isAll ? 'Wallet view' : selWallet?.name}</div>
                    {!isAll && <div className="wallet-hero-address">{selWallet?.address}</div>}
                  </div>
                  <div className="wallet-hero-summary">
                    <span>PulseChain-ready holdings</span>
                    <strong>{filteredViewAssets.length} assets</strong>
                  </div>
                </div>
                <div className="wallet-hero-value">
                  ${totalUsdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className="wallet-summary-strip">
                  <span className="wallet-summary-pill wallet-summary-pill--liquid">
                    Wallet ${walletUsdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="wallet-summary-pill wallet-summary-pill--staking">
                    Staking ${stakingUsdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                {/* pHEX / eHEX totals - matches Overview hero */}
                {(walletPHex > 0 || walletEHex > 0) && (
                  <div className="wallet-hex-strip">
                    {walletPHex > 0 && (
                      <span>
                        pHEX <strong className="wallet-hex-value wallet-hex-value--pulse">{fmtHexCount(walletPHex)}</strong>
                      </span>
                    )}
                    {walletEHex > 0 && (
                      <span>
                        eHEX <strong className="wallet-hex-value wallet-hex-value--eth">{fmtHexCount(walletEHex)}</strong>
                      </span>
                    )}
                  </div>
                )}
                {/* Chain filter chips */}
                <div className="wallet-chain-strip">
                  {(['all', 'pulsechain', 'ethereum', 'base'] as const).map(c => (
                    <button key={c} onClick={() => setWalletChainFilter(c)}
                      className={`filter-pill${walletChainFilter === c ? ' active' : ''}`}>
                      {c === 'all' ? 'All' : c === 'pulsechain' ? 'PulseChain' : c === 'ethereum' ? 'Ethereum' : 'Base'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Asset list - full Token Positions module */}
              <div className="wallet-holdings-card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div className={`wallet-holdings-head wallet-holdings-head--premium ${isCollapsed('wallet-holdings') ? '' : 'wallet-holdings-head--divided'}`}>
                  <div className="wallet-holdings-copy">
                    <div className="wallet-section-label">Wallet</div>
                    <div className="wallet-section-title">Holdings</div>
                    <div className="wallet-section-subtitle">{filteredViewAssets.length} tokens  -  ${walletUsdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="wallet-holdings-actions">
                    <div className="wallet-period-switch wallet-period-switch--premium">
                      {([['1h','1H'],['6h','6H'],['24h','24H'],['7d','7D']] as const).map(([p, label]) => (
                        <button key={p} onClick={() => setPriceChangePeriod(p)} className={`wallet-period-button ${priceChangePeriod === p ? 'is-active' : ''}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => toggleSection('wallet-holdings')}
                      className="overview-panel-toggle"
                      aria-label={isCollapsed('wallet-holdings') ? 'Expand wallet holdings' : 'Collapse wallet holdings'}
                      aria-expanded={!isCollapsed('wallet-holdings')}
                      title={isCollapsed('wallet-holdings') ? 'Expand' : 'Collapse'}
                    >
                      {isCollapsed('wallet-holdings') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                  </div>
                </div>
                {!isCollapsed('wallet-holdings') && (<>
                <HoldingsTable
                  assets={filteredDisplayAssets}
                  allAssets={currentAssets}
                  wallets={wallets}
                  totalValueUsd={totalUsdValue}
                  plsUsdPrice={prices['pulsechain']?.usd || 0}
                  priceChangePeriod={priceChangePeriod}
                  sortField={assetSortField as HoldingSortField}
                  sortDir={assetSortDir}
                  expandedIds={expandedWalletAssetIds}
                  tokenLogos={tokenLogos}
                  emptyMessage="No holdings found for this wallet"
                  currentTransactions={currentTransactions}
                  manualEntries={manualEntries}
                  chainColors={CHAIN_COLORS}
                  tokenMarketData={tokenMarketData}
                  staticLogos={STATIC_LOGOS}
                  getTokenLogoUrl={getTokenLogoUrl}
                  explorerUrl={explorerUrl}
                  dexScreenerUrl={dexScreenerUrl}
                  onSort={(field) => {
                    if (assetSortField === field) setAssetSortDir(d => d === 'desc' ? 'asc' : 'desc');
                    else { setAssetSortField(field); setAssetSortDir('desc'); }
                  }}
                  onToggleExpanded={(id) => setExpandedWalletAssetIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  onOpenPnl={asset => setPnlAsset(asset)}
                  onHide={hideToken}
                  onSetEntry={(id, value) => setManualEntries(prev => ({ ...prev, [id]: value }))}
                  onClearEntry={(id) => setManualEntries(prev => { const n = { ...prev }; delete n[id]; return n; })}
                  onFilterByAsset={symbol => { resetHistoryFilters(); setTxAssetFilter(symbol); setActiveTab('history'); }}
                  footerValueUsd={filteredViewAssets.reduce((sum, asset) => sum + asset.value, 0)}
                  shareBaseUsd={walletUsdValue}
                />
                {false && <div className="data-table-scroll">
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {[
                          { label: 'Token', field: null, align: 'left' },
                          { label: 'Price', field: null, align: 'right' },
                          { label: priceChangePeriod.toUpperCase(), field: 'change', align: 'right' },
                          { label: 'Amount', field: null, align: 'right' },
                          { label: 'Value', field: 'value', align: 'right' },
                          { label: '% of Portfolio', field: null, align: 'right' },
                          { label: '', field: null, align: 'right' },
                        ].map(({ label, field, align }, i) => (
                          <th key={i} onClick={field ? () => {
                            if (assetSortField === field) setAssetSortDir(d => d === 'desc' ? 'asc' : 'desc');
                            else { setAssetSortField(field as any); setAssetSortDir('desc'); }
                          } : undefined}
                            style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600,
                              color: assetSortField === field ? t.green : 'var(--fg-muted)',
                              textTransform: 'uppercase', letterSpacing: '.5px',
                              textAlign: align as any, whiteSpace: 'nowrap', background: 'var(--bg-surface)',
                              cursor: field ? 'pointer' : 'default', userSelect: 'none' }}>
                            {label}{field && assetSortField === field ? (assetSortDir === 'desc' ? ' down' : ' up') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViewAssets.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 13 }}>
                            No holdings found for this wallet
                          </td>
                        </tr>
                      ) : (
                        [...filteredViewAssets].sort((a, b) => {
                          const getVal = (x: any) => assetSortField === 'change'
                            ? (priceChangePeriod === '1h' ? (x.priceChange1h ?? 0)
                              : priceChangePeriod === '7d' ? (x.priceChange7d ?? 0)
                              : (x.priceChange24h ?? x.pnl24h ?? 0))
                            : x.value;
                          const diff = getVal(b) - getVal(a);
                          return assetSortDir === 'desc' ? diff : -diff;
                        }).map((asset) => {
                          const pct = priceChangePeriod === '1h' ? (asset.priceChange1h ?? 0)
                            : priceChangePeriod === '7d' ? (asset.priceChange7d ?? 0)
                            : priceChangePeriod === '6h' ? 0
                            : (asset.priceChange24h ?? asset.pnl24h ?? 0);
                          const share = ((asset.value / (walletUsdValue || 1)) * 100);
                          const addr = (asset as any).address;
                          const logo = STATIC_LOGOS[(asset as any).address?.toLowerCase?.()]
                            || (asset as any).logoUrl
                            || tokenLogos[(asset as any).address?.toLowerCase?.()]
                            || getTokenLogoUrl(asset);
                          const explUrl = explorerUrl(asset.chain, addr);
                          const dsUrl = dexScreenerUrl(asset.chain, addr);
                          return (
                            <React.Fragment key={asset.id}>
                            <tr
                              style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s', cursor: 'pointer' }}
                              onClick={() => setExpandedWalletAssetIds(prev => { const n = new Set(prev); n.has(asset.id) ? n.delete(asset.id) : n.add(asset.id); return n; })}
                              onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--fg)', flexShrink: 0, overflow: 'hidden' }}>
                                    {logo ? <img src={logo} alt={asset.symbol} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden'); }} /> : null}
                                    <span hidden={!!logo}>{asset.symbol[0]}</span>
                                  </div>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      {explUrl
                                        ? <a href={explUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}
                                            onMouseOver={e => (e.currentTarget.style.color = 'var(--accent)')}
                                            onMouseOut={e => (e.currentTarget.style.color = 'var(--fg)')}>
                                            {asset.symbol}
                                          </a>
                                        : <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{asset.symbol}</span>}
                                      {addr && addr !== 'native' && (
                                        <button onClick={() => navigator.clipboard.writeText(addr)}
                                          title={`Copy contract address: ${addr}`}
                                          style={{ padding: '1px 3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', transition: 'color .12s', lineHeight: 1 }}
                                          onMouseOver={e => (e.currentTarget.style.color = '#aaa')}
                                          onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                          <Copy size={10} />
                                        </button>
                                      )}
                                      {dsUrl && addr !== 'native' && (
                                        <a href={dsUrl} target="_blank" rel="noopener noreferrer"
                                          title="View on DexScreener"
                                          style={{ padding: '1px 3px', color: 'var(--fg-subtle)', transition: 'color .12s', lineHeight: 1, display: 'inline-flex' }}
                                          onMouseOver={e => (e.currentTarget.style.color = '#f4c542')}
                                          onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                          <ExternalLink size={10} />
                                        </a>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: CHAIN_COLORS[asset.chain] || '#555' }} />
                                      <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{asset.chain}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <PriceDisplay price={asset.price} className="" />
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap',
                                fontSize: 13, fontWeight: 600, color: pct >= 0 ? t.green : t.red }}>
                                {pct >= 0 ? '^' : 'v'} {Math.abs(pct).toFixed(2)}%
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                                  {asset.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{asset.symbol}</div>
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
                                  ${asset.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                </div>
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 90 }}>
                                <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 3 }}>{share.toFixed(1)}%</div>
                                <div style={{ height: 2, background: 'var(--border)', borderRadius: 1 }}>
                                  <div style={{ height: '100%', width: `${Math.min(share, 100)}%`, background: 'var(--accent)', borderRadius: 1 }} />
                                </div>
                              </td>
                              <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); setPnlAsset(pnlAsset?.id === asset.id ? null : asset); }}
                                    title="View P&L"
                                    style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', transition: 'color .12s',
                                      color: pnlAsset?.id === asset.id ? '#a78bfa' : '#555' }}
                                    onMouseOver={e => (e.currentTarget.style.color = '#a78bfa')}
                                    onMouseOut={e => (e.currentTarget.style.color = pnlAsset?.id === asset.id ? '#a78bfa' : '#555')}>
                                    <Calculator size={13} />
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); hideToken(asset.id); }}
                                    style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', transition: 'color .12s' }}
                                    onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
                                    title="Hide">
                                    <Trash2 size={13} />
                                  </button>
                                  <span style={{ color: expandedWalletAssetIds.has(asset.id) ? t.green : 'var(--fg-subtle)', padding: 4, display: 'inline-flex', transition: 'color .12s' }}>
                                    {expandedWalletAssetIds.has(asset.id) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {/* Expanded wallet asset row */}
                            {expandedWalletAssetIds.has(asset.id) && (() => {
                              const plsPrice = prices['pulsechain']?.usd || 0.00005;
                              const wPriceInPls = plsPrice > 0 ? asset.price / plsPrice : 0;
                              const wCurrentPlsValue = asset.value / plsPrice;
                              const wEntryPls = manualEntries[asset.id];
                              const wPnlPls = wEntryPls ? wCurrentPlsValue - wEntryPls : null;
                              return (
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                                  <td colSpan={7} style={{ padding: '0 16px 14px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, paddingTop: 12 }}>
                                      {/* Price card */}
                                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>Price</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fg)' }}><PriceDisplay price={asset.price} /></div>
                                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                                          {wPriceInPls > 0 ? `${wPriceInPls >= 1000 ? `${(wPriceInPls/1000).toFixed(2)}K` : wPriceInPls.toFixed(4)} PLS` : ''}
                                        </div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: pct >= 0 ? t.green : t.red, marginTop: 4 }}>
                                          {pct >= 0 ? '^' : 'v'} {Math.abs(pct).toFixed(2)}% (24h)
                                        </div>
                                      </div>
                                      {/* Holdings card */}
                                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>Your Holdings</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>
                                          {asset.balance >= 1e6 ? `${(asset.balance/1e6).toFixed(2)}M` : asset.balance >= 1e3 ? `${(asset.balance/1e3).toFixed(2)}K` : asset.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} {asset.symbol}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>${asset.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                                        {wCurrentPlsValue > 0 && <div style={{ fontSize: 12, color: 'var(--chain-pulse)', marginTop: 2, fontFamily: 'var(--font-shell-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>{wCurrentPlsValue >= 1e6 ? `${(wCurrentPlsValue/1e6).toFixed(2)}M` : wCurrentPlsValue >= 1e3 ? `${(wCurrentPlsValue/1e3).toFixed(2)}K` : wCurrentPlsValue.toFixed(0)} PLS</div>}
                                      </div>
                                      {/* P&L card */}
                                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 14px' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span>P&amp;L (PLS basis)</span>
                                          {wEntryPls && (
                                            <button onClick={e => { e.stopPropagation(); setManualEntries(prev => { const n = { ...prev }; delete n[asset.id]; return n; }); }}
                                              title="Clear entry"
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 2, display: 'flex', alignItems: 'center', transition: 'color .12s' }}
                                              onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                              onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}>
                                              <X size={13} />
                                            </button>
                                          )}
                                        </div>
                                        {wEntryPls ? (
                                          <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Entry</span>
                                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)' }}>{wEntryPls.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Now</span>
                                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{wCurrentPlsValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-subtle)' }}>Net P&L</span>
                                              <span style={{ fontSize: 14, fontWeight: 800, color: wPnlPls !== null && wPnlPls >= 0 ? t.green : t.red }}>
                                                {wPnlPls !== null ? `${wPnlPls >= 0 ? '+' : ''}${wPnlPls.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS` : '-'}
                                              </span>
                                            </div>
                                          </>
                                        ) : (
                                          <div>
                                            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 8 }}>Set entry to track P&L</div>
                                            <input type="number" placeholder="Entry PLS amount"
                                              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: 12, padding: '5px 8px', outline: 'none' }}
                                              onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setManualEntries(prev => ({ ...prev, [asset.id]: v })); }} />
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                     {/* -- Transactions & Realized P&L for this token -- */}
                                     {(() => {
                                       const sym = asset.symbol.toUpperCase();
                                       const tokenTxs = currentTransactions.filter(tx =>
                                         tx.asset.toUpperCase() === sym && tx.chain === asset.chain
                                       );
                                       if (tokenTxs.length === 0) return null;
                                       let totalBoughtAmt = 0, totalSoldAmt = 0, totalCostUsd = 0, totalProceedsUsd = 0;
                                       tokenTxs.forEach(tx => {
                                         const isBuyTx = tx.type === 'deposit' || (tx.type === 'swap' && tx.counterAsset !== asset.symbol);
                                         if (isBuyTx) { totalBoughtAmt += tx.amount; totalCostUsd += tx.valueUsd || 0; }
                                         else { totalSoldAmt += tx.amount; totalProceedsUsd += tx.valueUsd || 0; }
                                       });
                                       const realizedPnlTok = totalProceedsUsd - totalCostUsd;
                                       const previewTxs = tokenTxs.slice(0, 8);
                                       return (
                                         <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                           <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                             <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.7px' }}>Transactions &amp; P&amp;L</span>
                                             <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-subtle)', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 20, border: '1px solid var(--border)' }}>{tokenTxs.length}</span>
                                           </div>
                                           <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                                             <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                               <span style={{ color: 'var(--fg-subtle)' }}>Bought </span>
                                               <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{totalBoughtAmt >= 1e6 ? `${(totalBoughtAmt/1e6).toFixed(2)}M` : totalBoughtAmt >= 1e3 ? `${(totalBoughtAmt/1e3).toFixed(2)}K` : totalBoughtAmt.toLocaleString('en-US', { maximumFractionDigits: 2 })} {sym}</span>
                                               {totalCostUsd > 0 && <span style={{ color: 'var(--fg-subtle)', marginLeft: 4 }}>(${totalCostUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})</span>}
                                             </div>
                                             <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                               <span style={{ color: 'var(--fg-subtle)' }}>Sold </span>
                                               <span style={{ color: 'var(--fg)', fontWeight: 700 }}>{totalSoldAmt >= 1e6 ? `${(totalSoldAmt/1e6).toFixed(2)}M` : totalSoldAmt >= 1e3 ? `${(totalSoldAmt/1e3).toFixed(2)}K` : totalSoldAmt.toLocaleString('en-US', { maximumFractionDigits: 2 })} {sym}</span>
                                               {totalProceedsUsd > 0 && <span style={{ color: 'var(--fg-subtle)', marginLeft: 4 }}>(${totalProceedsUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})</span>}
                                             </div>
                                             {(totalCostUsd > 0 || totalProceedsUsd > 0) && (
                                               <div style={{ background: realizedPnlTok >= 0 ? 'rgba(0,255,159,.1)' : 'rgba(244,63,94,.1)', border: `1px solid ${realizedPnlTok >= 0 ? 'rgba(0,255,159,.25)' : 'rgba(244,63,94,.25)'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                                 <span style={{ color: 'var(--fg-subtle)' }}>Realized P&amp;L </span>
                                                 <span style={{ fontWeight: 800, color: realizedPnlTok >= 0 ? t.green : t.red }}>{realizedPnlTok >= 0 ? '+' : ''}${realizedPnlTok.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                                               </div>
                                             )}
                                           </div>
                                           {/* Unified tx-card list replaces old mini table */}
                                           <TransactionList
                                             transactions={previewTxs}
                                             viewAsYou={viewAsYou}
                                             wallets={wallets}
                                             compact
                                             assets={currentAssets}
                                             getTokenLogoUrl={getTokenLogoUrl}
                                             tokenLogos={tokenLogos}
                                             onFilterByAsset={symbol => { resetHistoryFilters(); setTxAssetFilter(symbol); setActiveTab('history'); }}
                                             emptyMessage="No transactions for this token."
                                           />
                                           {tokenTxs.length > 8 && (
                                             <div style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: 'var(--fg-subtle)' }}>
                                               +{tokenTxs.length - 8} more &mdash;{' '}
                                              <button onClick={e => { e.stopPropagation(); resetHistoryFilters(); setTxAssetFilter(asset.symbol); setActiveTab('history'); }}
                                                 style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                                 view all in Holdings
                                               </button>
                                             </div>
                                           )}
                                         </div>
                                       );
                                     })()}
                                  </td>
                                </tr>
                              );
                            })()}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                    {filteredViewAssets.length > 0 && (
                      <tfoot>
                        <tr style={{ borderTop: '1px solid var(--border)' }}>
                          <td colSpan={4} style={{ padding: '10px 16px', fontSize: 13, color: 'var(--fg-muted)', fontWeight: 600 }}>TOTAL LIQUID</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                            ${walletUsdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>}
                </>)}
              </div>



              {/* -- WALLET TRANSACTIONS -- */}
              {(() => {
                const baseTxs = (isAll
                  ? currentTransactions
                  : currentTransactions.filter(tx => tx.from?.toLowerCase() === selectedWalletAddr || tx.to?.toLowerCase() === selectedWalletAddr)
                ).filter(tx => tx.chain === 'pulsechain');
                const filtered = baseTxs.filter(tx => {
                  if (txTypeFilter !== 'all') {
                    if (txTypeFilter === 'swap' && tx.type !== 'swap' && !tx.swapLegOnly) return false;
                    if (txTypeFilter === 'withdraw' && (tx.type !== 'withdraw' || tx.swapLegOnly)) return false;
                    if (txTypeFilter !== 'swap' && txTypeFilter !== 'withdraw' && tx.type !== txTypeFilter) return false;
                  }
                  if (txAssetFilter !== 'all' &&
                    !sameAssetSymbol(tx.asset, txAssetFilter, tx.chain) &&
                    !sameAssetSymbol(tx.counterAsset ?? '', txAssetFilter, tx.chain)
                  ) return false;
                  return true;
                });
                if (baseTxs.length === 0) return null;
                return (
                  <div className="tx-module-card wallet-tx-module">
                    <div className="tx-module-header" style={{ borderBottom: isCollapsed('wallet-txs') ? 'none' : '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Transactions</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                          {baseTxs.length} txs
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!isCollapsed('wallet-txs') && [
                          { value: txTypeFilter, onChange: setTxTypeFilter, options: [['all','All Types'],['deposit','Received'],['withdraw','Sent'],['swap','Swaps'],['interaction','Calls']] as [string,string][] },
                          { value: txAssetFilter, onChange: setTxAssetFilter, options: [['all','All Tokens'], ...Array.from(new Set(baseTxs.flatMap(tx => [tx.asset, tx.counterAsset].filter(Boolean) as string[]))).sort().map(a => [a,a])] as [string,string][] },
                        ].map(({ value, onChange, options }, i) => (
                          <select key={i} value={value} onChange={e => onChange(e.target.value)}
                            className="history-filter-select"
                            style={{ background: 'var(--bg-elevated)', border: `1px solid ${t.border}`, borderRadius: 6, color: 'var(--fg)', fontSize: 13, padding: '5px 10px', cursor: 'pointer', outline: 'none' }}>
                            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ))}
                        <button onClick={() => toggleSection('wallet-txs')}
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', transition: 'color .12s' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--fg)')} onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
                          title={isCollapsed('wallet-txs') ? 'Expand' : 'Collapse'}>
                          {isCollapsed('wallet-txs') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </button>
                      </div>
                    </div>
                    {!isCollapsed('wallet-txs') && (
                      <div className="custom-scrollbar tx-module-list wallet-tx-list">
                        <TransactionList
                          transactions={filtered}
                          viewAsYou={viewAsYou}
                          wallets={wallets}
                          assets={currentAssets}
                          getTokenLogoUrl={getTokenLogoUrl}
                          tokenLogos={tokenLogos}
                          hideIds={hiddenTxIds}
                          onToggleHide={id => setHiddenTxIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                          showHidden={showHiddenTxs}
                          emptyMessage="No transactions found for these filters."
                          initialVisibleCount={100}
                          loadMoreCount={100}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const hiddenChainAssets = walletChainFilter === 'all' ? hiddenAssetRows : hiddenAssetRows.filter(a => a.chain === walletChainFilter);
                return (
                <div className={`coin-visibility-panel${showHiddenCoins ? ' is-open' : ''}`}>
                  <button type="button" className="coin-visibility-trigger" onClick={() => setShowHiddenCoins(v => !v)} aria-expanded={showHiddenCoins}>
                    <div className="coin-visibility-copy">
                      <span>Coin visibility</span>
                      <strong>Manage hidden coins under assets.</strong>
                      <small>Open the hidden list, restore assets, and control dust or spam filters.</small>
                    </div>
                    <div className="coin-visibility-stats">
                      <span>{hiddenTokens.length} hidden</span>
                      <span>{hideDust ? 'Dust hidden' : 'Dust visible'}</span>
                      <span>{hideSpam ? 'Spam hidden' : 'Spam visible'}</span>
                    </div>
                    <ChevronDown size={16} className="coin-visibility-chevron" />
                  </button>
                  {showHiddenCoins && (
                    <div className="coin-visibility-dropdown-panel">
                      <div className="coin-visibility-actions">
                        <button type="button" onClick={() => setHideDust(v => !v)}>
                          <Eye size={13} />
                          {hideDust ? 'Show dust' : 'Hide dust'}
                        </button>
                        <button type="button" onClick={() => setHideSpam(v => !v)}>
                          <Shield size={13} />
                          {hideSpam ? 'Show spam' : 'Hide spam'}
                        </button>
                        {hiddenTokens.length > 0 && (
                          <button type="button" className="coin-visibility-primary" onClick={() => setHiddenTokens([])}>
                            <Plus size={13} />
                            Unhide all
                          </button>
                        )}
                      </div>
                      <div className="hidden-coins-panel">
                        <div className="hidden-coins-panel-header">
                          <div>
                            <div className="hidden-coins-title">Coin visibility</div>
                            <div className="hidden-coins-subtitle">
                              {hiddenTokens.length === 0
                                ? 'Nothing is manually hidden. New buys can still be affected by Dust or Spam filters.'
                                : `${hiddenTokens.length} hidden token${hiddenTokens.length !== 1 ? 's' : ''}. Unhide anything that was hidden by mistake.`}
                            </div>
                          </div>
                          <div className="hidden-coins-actions">
                            <button
                              type="button"
                              className="hidden-coins-soft-btn"
                              onClick={() => { setHideDust(false); setHideSpam(false); }}
                            >
                              Show all filters
                            </button>
                            {hiddenTokens.length > 0 && (
                              <button
                                type="button"
                                className="hidden-coins-soft-btn hidden-coins-danger-btn"
                                onClick={() => setHiddenTokens([])}
                              >
                                Unhide all
                              </button>
                            )}
                          </div>
                        </div>
                        {hiddenChainAssets.length > 0 ? (
                          <div className="hidden-coins-list">
                            {hiddenChainAssets.map(asset => {
                              const logo = STATIC_LOGOS[(asset as any).address?.toLowerCase?.()] || (asset as any).logoUrl || tokenLogos[(asset as any).address?.toLowerCase?.()] || getTokenLogoUrl(asset);
                              return (
                                <div key={asset.id} className="hidden-coin-row">
                                  <div className="hidden-coin-identity">
                                    <span className="hidden-coin-logo">{logo ? <img src={logo} alt={asset.symbol} /> : asset.symbol.slice(0, 1)}</span>
                                    <span>
                                      <span className="hidden-coin-name">{asset.symbol}</span>
                                      <span className="hidden-coin-meta">{asset.name} - {asset.chain}</span>
                                    </span>
                                  </div>
                                  <div className="hidden-coin-side">
                                    <span className="hidden-coin-value">${asset.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                                    <button type="button" className="hidden-coins-unhide-btn" onClick={() => unhideToken(asset.id)}>
                                      Unhide
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="hidden-coins-empty">
                            {walletChainFilter === 'all' ? 'No manually hidden coins.' : `No hidden coins on ${walletChainFilter}.`}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}
            </motion.div>
          );
        })()}

        {activeTab === 'pulsechain-official' && (
          <motion.div key='pulsechain-official' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MyInvestmentsPage
              investedFiat={summary.netInvestment > MIN_INVESTMENT_THRESHOLD ? Math.abs(summary.netInvestment) : 0}
              currentValue={summary.totalValue}
              liquidValue={summary.liquidValue}
              stakedValue={summary.stakingValueUsd}
              plsUsdPrice={prices['pulsechain']?.usd || 0}
              rows={investmentRows}
              onOpenTransactions={openHistoryDrilldown}
            />
          </motion.div>
        )}

        {activeTab === 'wallet-analyzer' && (
          <motion.div key='wallet-analyzer' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WalletAnalyzerPage {...walletAnalyzerPageProps} />
          </motion.div>
        )}
        {activeTab === 'pulsechain-community' && (
          <motion.div key="pulsechain-community" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PulseChainCommunityPage />
          </motion.div>
        )}

        {activeTab === 'bridge' && (
          <motion.div key="bridge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BridgeDashboardPage
              afterOfficialBridge={(
                <div className="tx-module-card received-token-module">
                  <div className="received-header tx-module-header" style={{ borderBottom: isCollapsed('received-assets') ? 'none' : '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      <ArrowDownLeft size={16} style={{ color: '#627EEA', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>MultiChain Transactions</span>
                      <select value={receivedChainFilter === 'pulsechain' ? 'all' : receivedChainFilter} onChange={e => setReceivedChainFilter(e.target.value)}
                        className="history-filter-select"
                        style={{ background: 'var(--bg-elevated)', border: `1px solid ${t.border}`, borderRadius: 6, color: 'var(--fg)', fontSize: 13, padding: '4px 8px', cursor: 'pointer', outline: 'none' }}>
                        <option value="all">All Chains</option>
                        <option value="ethereum">Ethereum</option>
                        <option value="base">Base</option>
                      </select>
                      <select value={receivedCoinFilter} onChange={e => setReceivedCoinFilter(e.target.value)}
                        className="history-filter-select"
                        style={{ background: 'var(--bg-elevated)', border: `1px solid ${t.border}`, borderRadius: 6, color: 'var(--fg)', fontSize: 13, padding: '4px 8px', cursor: 'pointer', outline: 'none' }}>
                        <option value="all">All Coins</option>
                        <option value="ETH">ETH</option>
                        <option value="USDC">USDC</option>
                        <option value="USDT">USDT</option>
                        <option value="DAI">DAI</option>
                      </select>
                    </div>
                    <div className="received-totals" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 2, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase' }}>Total Received</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>${receivedAssetsData.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{receivedAssetsData.list.length} tx</div>
                      </div>
                      <button onClick={() => toggleSection('received-assets')}
                        style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', transition: 'color .12s', flexShrink: 0 }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--fg)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
                        title={isCollapsed('received-assets') ? 'Expand' : 'Collapse'}>
                        {isCollapsed('received-assets') ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                      </button>
                    </div>
                  </div>
                  {!isCollapsed('received-assets') && (<>
                  {receivedAssetsData.list.length > 0 && (
                    <div tabIndex={0} className="received-asset-summary-row custom-scrollbar">
                      {(Object.entries(receivedAssetsData.byAsset) as [string, { amount: number; valueUsd: number }][]).map(([sym, data]) => (
                        <div key={sym} className="received-asset-summary-card">
                          <div className="received-asset-symbol">{sym}</div>
                          <div className="received-asset-amount">
                            {sym === 'ETH' ? data.amount.toLocaleString('en-US', { maximumFractionDigits: 4 }) : data.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} {sym}
                          </div>
                          <div className="received-asset-value">${data.valueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="received-history-list custom-scrollbar tx-module-list">
                    {receivedAssetsData.list.length === 0 ? (
                      <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                        {wallets.length === 0
                          ? 'Add wallets to see received assets history.'
                          : ['ethereum', 'base'].includes(receivedChainFilter === 'pulsechain' ? 'all' : receivedChainFilter) && !etherscanApiKey
                          ? <span>
                              No Ethereum/Base transactions loaded.{' '}
                              <button
                                onClick={() => { setApiKeyInput(''); setIsApiKeyModalOpen(true); }}
                                style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13, padding: 0 }}>
                                Add an Etherscan API key
                              </button>
                              {' '}for reliable ETH/Base history.
                            </span>
                          : 'No ETH or stablecoin inbound transfers found since 2021.'}
                      </div>
                    ) : (
                      <TransactionList
                        transactions={receivedAssetsData.list.map(tx => {
                          const assetUp = tx.asset.toUpperCase();
                          const isEth = assetUp === 'ETH';
                          const isPls = assetUp === 'PLS';
                          const pulseDaiPrice = prices['pulsechain:0xefd766ccb38eaf1dfd701853bfce31359239f305']?.usd
                            ?? prices['pulsechain:0x6b175474e89094c44da98b954eedeac495271d0f']?.usd
                            ?? prices['pulsechain:dai']?.usd
                            ?? 0;
                          const daiPrice = tx.chain === 'pulsechain' ? pulseDaiPrice : (prices['dai']?.usd ?? 0);
                          const usdtPrice = tx.chain === 'pulsechain'
                            ? (prices['pulsechain:0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f']?.usd ?? 0)
                            : (prices['tether']?.usd ?? 1);
                          const usdcPrice = tx.chain === 'pulsechain'
                            ? (prices['pulsechain:0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07']?.usd ?? 0)
                            : (prices['usd-coin']?.usd ?? 1);
                          const displayUsd = tx.valueUsd || (
                            isEth ? tx.amount * (prices['ethereum']?.usd || 3400) :
                            isPls ? tx.amount * (prices['pulsechain']?.usd || 0.00005) :
                            assetUp.includes('USDT') || assetUp.includes('TETHER') ? tx.amount * usdtPrice :
                            assetUp.includes('DAI') ? tx.amount * daiPrice :
                            tx.amount * usdcPrice
                          );
                          return { ...tx, valueUsd: displayUsd };
                        })}
                        viewAsYou={viewAsYou}
                        wallets={wallets}
                        assets={currentAssets}
                        getTokenLogoUrl={getTokenLogoUrl}
                        tokenLogos={tokenLogos}
                        hideIds={hiddenTxIds}
                        onToggleHide={id => setHiddenTxIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                        showHidden={showHiddenTxs}
                        emptyMessage="No received token transactions found for these filters."
                      />
                    )}
                  </div>
                  </>)}
                </div>
              )}
            />
          </motion.div>
        )}

              </AnimatePresence>
          </div>

          {/* Footer */}
          <footer className="border-t border-white/5 py-6 px-8 text-center text-white/20 text-xs font-medium uppercase tracking-[0.2em]">
            PulsePort &copy; 2026 &bull; Powered by PulseChain, Ethereum &amp; Base
          </footer>
        </div>
      </main>

      {/* -- MOBILE BOTTOM NAV -- */}
      <nav className="mobile-bottom-nav bottom-nav-blur md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'var(--bg-header)',
          borderTop: '1px solid var(--border)',
        }}>
        <div className={`mobile-more-sheet${mobileMoreOpen ? ' is-open' : ''}`}>
          {mobileMoreNavItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`mobile-more-link${activeTab === id ? ' is-active' : ''}`}
              onClick={() => {
                setActiveTab(id);
                setMobileMoreOpen(false);
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="mobile-bottom-nav-inner">
        {mobilePrimaryNavItems.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setActiveTab(id); setMobileMoreOpen(false); }}
            className="mobile-nav-tab-btn"
            style={{
              color: activeTab === id ? 'var(--accent)' : 'var(--fg-muted)',
            }}>
            <div className={activeTab === id ? 'bottom-nav-dot' : ''}>
              <Icon size={19} />
            </div>
            <span style={{ fontSize: 9, fontWeight: activeTab === id ? 700 : 500, lineHeight: 1, marginTop: 3 }}>{label}</span>
          </button>
        ))}
          <button
            type="button"
            onClick={() => setMobileMoreOpen(v => !v)}
            className="mobile-nav-tab-btn"
            style={{
              color: mobileMoreOpen || mobileMoreActive ? 'var(--accent)' : 'var(--fg-muted)',
            }}
          >
            <div className={mobileMoreOpen || mobileMoreActive ? 'bottom-nav-dot' : ''}>
              <Layers size={19} />
            </div>
            <span style={{ fontSize: 9, fontWeight: mobileMoreOpen || mobileMoreActive ? 700 : 500, lineHeight: 1, marginTop: 3 }}>More</span>
          </button>
        </div>
      </nav>

      {/* Add Wallet Modal */}
      <AnimatePresence>
        {isAddingWallet && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingWallet(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 20, stiffness: 90 }}
              className="wallet-modal-panel sm:rounded-[20px]"
            >
              {/* Drag handle (mobile) */}
              <div className="sm:hidden" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
              </div>
              <div className="wallet-modal-head">
                <span>Wallet Intake</span>
                <h2>Track A New Wallet</h2>
                <p>Paste any public EVM address once. PulsePort reads balances, transactions, and attribution without ever touching private keys.</p>
              </div>
              <div className="wallet-modal-info-grid" aria-hidden="true">
                <div>
                  <strong>Networks</strong>
                  <span>PulseChain, Ethereum, and Base sync from the same address.</span>
                </div>
                <div>
                  <strong>Best Result</strong>
                  <span>Add an Etherscan key later if you want stronger Ethereum history and invested fiat attribution.</span>
                </div>
              </div>
              <div className="wallet-modal-fields">
                <div className="wallet-modal-field">
                  <label htmlFor="wallet-address-input">
                    Wallet Address
                  </label>
                  <input
                    id="wallet-address-input"
                    type="text"
                    name="wallet-address"
                    placeholder="0xABCD…"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={walletFormError ? true : undefined}
                    aria-describedby="wallet-address-helper"
                    value={newWalletAddress}
                    onChange={(e) => {
                      setNewWalletAddress(e.target.value);
                      if (walletFormError) setWalletFormError('');
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') addWallet(); }}
                    className="wallet-modal-input wallet-modal-input--mono"
                  />
                </div>
                <div id="wallet-address-helper" className="wallet-modal-helper">
                  Use the public address only. One wallet can surface all tracked chains inside the app.
                </div>
                <div className="wallet-modal-field">
                  <label htmlFor="wallet-name-input">
                    Wallet Name <span style={{ color: t.textMuted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </label>
                  <input
                    id="wallet-name-input"
                    type="text"
                    name="wallet-name"
                    placeholder="Main Wallet"
                    autoComplete="off"
                    value={newWalletName}
                    onChange={(e) => {
                      setNewWalletName(e.target.value);
                      if (walletFormError) setWalletFormError('');
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') addWallet(); }}
                    className="wallet-modal-input"
                  />
                </div>
                <div className={`wallet-modal-status${walletFormError ? ' is-error' : ''}`} aria-live="polite">
                  {walletFormError || 'Wallets are read-only. PulsePort never requests private keys or signatures for portfolio tracking.'}
                </div>
                <div className="wallet-modal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingWallet(false);
                      setWalletFormError('');
                    }}
                    className="wallet-modal-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addWallet}
                    disabled={!newWalletAddress.trim()}
                    className="wallet-modal-primary"
                  >
                    Track Wallet
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Wallet Modal */}
      <AnimatePresence>
        {editingWalletAddress && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingWalletAddress(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 20, stiffness: 90 }}
              className="wallet-modal-panel wallet-modal-panel--compact sm:rounded-[20px]"
            >
              {/* Drag handle (mobile) */}
              <div className="sm:hidden" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Pencil size={18} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>Rename Wallet</span>
              </div>
              <div className="wallet-modal-address-chip">
                {editingWalletAddress}
              </div>
              <div className="wallet-modal-field" style={{ marginBottom: 20 }}>
                <label htmlFor="wallet-rename-input">
                  Wallet Name
                </label>
                <input
                  id="wallet-rename-input"
                  type="text"
                  name="wallet-rename"
                  value={editWalletName}
                  onChange={e => setEditWalletName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameWallet(editingWalletAddress, editWalletName); }}
                  autoComplete="off"
                  className="wallet-modal-input"
                />
              </div>
              <div className="wallet-modal-actions">
                <button type="button" onClick={() => setEditingWalletAddress(null)}
                  className="wallet-modal-secondary">
                  Cancel
                </button>
                <button type="button" onClick={() => renameWallet(editingWalletAddress, editWalletName)}
                  className="wallet-modal-primary">
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -- P&L Modal -- */}
      {pnlAsset && (
        <PnLModal
          asset={pnlAsset}
          transactions={currentTransactions}
          prices={prices}
          logoUrl={STATIC_LOGOS[(pnlAsset as any).address?.toLowerCase?.()] || (pnlAsset as any).logoUrl || tokenLogos[(pnlAsset as any).address?.toLowerCase?.()] || getTokenLogoUrl(pnlAsset)}
          onClose={() => setPnlAsset(null)}
          walletAddress={selectedWalletAddr !== 'all' ? selectedWalletAddr : undefined}
        />
      )}

      {/* -- Token Card Detail Modal -- */}
      {tokenCardModal && (
        <TokenCardModal
          asset={tokenCardModal}
          portfolioTotal={summary.totalValue}
          logoUrl={STATIC_LOGOS[(tokenCardModal as any).address?.toLowerCase?.()] || (tokenCardModal as any).logoUrl || tokenLogos[(tokenCardModal as any).address?.toLowerCase?.()] || getTokenLogoUrl(tokenCardModal)}
          marketData={tokenMarketData[tokenCardModal.id]}
          isLoadingMarketData={tokenCardModalLoading}
          theme={theme}
          onClose={() => setTokenCardModal(null)}
          dexScreenerUrl={dexScreenerUrl(tokenCardModal.chain, (tokenCardModal as any).address)}
          explorerUrl={explorerUrl(tokenCardModal.chain, (tokenCardModal as any).address)}
        />
      )}

      <AnimatePresence>
        {isCustomCoinsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCustomCoinsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 22, stiffness: 120 }}
              className="custom-coin-modal sm:rounded-[20px]"
            >
              <div className="custom-coin-modal-head">
                <Plus size={18} />
                <div>
                  <strong>Add coin manually</strong>
                  <span>Use this when a wallet token has no reliable price feed yet.</span>
                </div>
              </div>
              <div className="custom-coin-grid">
                <label>
                  Symbol
                  <input value={customCoinDraft.symbol} onChange={e => setCustomCoinDraft(prev => ({ ...prev, symbol: e.target.value }))} placeholder="GO" autoFocus />
                </label>
                <label>
                  Name
                  <input value={customCoinDraft.name} onChange={e => setCustomCoinDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="GoPulse" />
                </label>
                <label>
                  Balance
                  <input type="number" min="0" step="any" value={customCoinDraft.balance} onChange={e => setCustomCoinDraft(prev => ({ ...prev, balance: e.target.value }))} placeholder="1000" />
                </label>
                <label>
                  Price USD
                  <input type="number" min="0" step="any" value={customCoinDraft.price} onChange={e => setCustomCoinDraft(prev => ({ ...prev, price: e.target.value }))} placeholder="0.001" onKeyDown={e => { if (e.key === 'Enter') submitCustomCoin(); }} />
                </label>
              </div>
              <div className="custom-coin-actions">
                <button type="button" onClick={() => setIsCustomCoinsModalOpen(false)}>Cancel</button>
                <button type="button" className="custom-coin-submit" onClick={submitCustomCoin}>Add to portfolio</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -- Market Watch Modal -- */}
      {showMarketWatch && (
        <MarketWatchModal
          theme={theme}
          initialSearch={marketWatchInitialSearch}
          onClose={() => setShowMarketWatch(false)}
        />
      )}

      {/* -- Profit Planner Modal -- */}
      {profitPlannerOpen && (
        <ProfitPlannerModal
          open={profitPlannerOpen}
          onClose={() => setProfitPlannerOpen(false)}
          assets={currentAssets}
          totalValue={summary?.totalValue ?? 0}
        />
      )}

      {/* API Key Modal */}
      <AnimatePresence>
        {isApiKeyModalOpen && (
          <div className="api-key-backdrop fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsApiKeyModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.98, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 24 }}
              className="api-key-panel">
              <div className="api-key-drag-handle" />
              <div className="api-key-head">
                <div className="api-key-head-icon">
                  <Settings size={18} />
                </div>
                <div>
                  <span>API Key</span>
                  <small>Optional, but recommended for Ethereum history</small>
                </div>
              </div>
              <div className="api-key-info-grid">
                <div>
                  <strong>Who provides it?</strong>
                  <span>Etherscan. A free Etherscan V2 API key lets PulsePort read your public Ethereum transactions more reliably.</span>
                </div>
                <div>
                  <strong>Why is it here?</strong>
                  <span>It improves ETH deposits, stablecoin inflows, transaction history, and invested/P&L calculations. Your key is saved only in this browser.</span>
                </div>
                <div>
                  <strong>What still works without it?</strong>
                  <span>PulseChain balances, PulseChain transactions, Base via Blockscout, prices, Market Watch, and manual coins still work.</span>
                </div>
              </div>
              <a className="api-key-link" href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer">
                Get a free key from Etherscan <ExternalLink size={12} />
              </a>
              <label className="api-key-input-label">
                Etherscan API key
                <input type="text" id="etherscan-api-key-input" name="etherscan-api-key" placeholder="Paste your Etherscan API key…"
                value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                />
              </label>
              <div className="api-key-actions">
                <button type="button" onClick={() => setIsApiKeyModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" onClick={() => {
                  const ethKey = apiKeyInput.trim();
                  setEtherscanApiKey(ethKey);
                  if (ethKey) localStorage.setItem('pulseport_etherscan_key', ethKey);
                  else localStorage.removeItem('pulseport_etherscan_key');
                  localStorage.removeItem('pulseport_basescan_key');
                  setIsApiKeyModalOpen(false);
                  setTimeout(fetchPortfolio, 100);
                }}
                  className="api-key-save">
                  Save &amp; Refresh
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}



