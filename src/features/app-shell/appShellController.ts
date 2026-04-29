import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Droplets,
  History,
  LayoutDashboard,
  Lock,
  PieChart as PieChartIcon,
  Zap,
} from 'lucide-react';

export type ActiveTab =
  | 'home'
  | 'overview'
  | 'assets'
  | 'stakes'
  | 'history'
  | 'tracker'
  | 'wallets'
  | 'defi'
  | 'pulsechain-official'
  | 'wallet-analyzer'
  | 'pulsechain-community'
  | 'bridge';

export type AppShellNavItem = {
  id: ActiveTab;
  label: string;
  icon: LucideIcon;
};

export const ACTIVE_TABS: ActiveTab[] = [
  'home',
  'overview',
  'assets',
  'stakes',
  'history',
  'tracker',
  'defi',
  'pulsechain-official',
  'wallet-analyzer',
  'pulsechain-community',
  'bridge',
];

export const ACTIVE_TAB_STORAGE_KEY = 'pulseport_active_tab';

const MOBILE_PRIMARY_TAB_IDS: ActiveTab[] = ['home', 'overview', 'wallet-analyzer'];

export const APP_NAV_ITEMS: readonly AppShellNavItem[] = [
  { id: 'home', label: 'Dashboard', icon: Activity },
  { id: 'overview', label: 'Portfolio', icon: LayoutDashboard },
  { id: 'wallet-analyzer', label: 'Wallet Analyzer', icon: PieChartIcon },
  { id: 'stakes', label: 'HEX Staking', icon: Lock },
  { id: 'pulsechain-official', label: 'My Investments', icon: Zap },
  { id: 'history', label: 'Transactions', icon: History },
  { id: 'defi', label: 'DeFi', icon: Droplets },
];

export const APP_PAGE_META: Record<ActiveTab, { title: string; subtitle: string }> = {
  home: {
    title: 'Dashboard',
    subtitle: 'Current portfolio state across PulseChain, Ethereum, and Base.',
  },
  overview: {
    title: 'Portfolio',
    subtitle: 'Holdings, allocation, and performance by exact asset identity.',
  },
  'wallet-analyzer': {
    title: 'Wallet Analyzer',
    subtitle: 'Performance, risk, and behavior analytics across tracked wallets.',
  },
  stakes: {
    title: 'HEX Staking',
    subtitle: 'Liquid and staked HEX exposure across PulseChain and Ethereum.',
  },
  wallets: {
    title: 'Wallets',
    subtitle: 'Tracked wallet addresses and grouped balances.',
  },
  tracker: {
    title: 'Tracker',
    subtitle: 'Imported tracking and portfolio state.',
  },
  assets: {
    title: 'Wallets & Bridges',
    subtitle: 'Wallet-level holdings, bridge activity, and cross-chain movement.',
  },
  'pulsechain-official': {
    title: 'My Investments',
    subtitle: 'Initial capital mapped against current PulseChain ownership.',
  },
  history: {
    title: 'Transactions',
    subtitle: 'Full ledger for bridges, swaps, and cost-basis drill-down.',
  },
  'pulsechain-community': {
    title: 'Ecosystem',
    subtitle: 'PulseChain reference, contracts, bridges, and community resources.',
  },
  bridge: {
    title: 'Bridges',
    subtitle: 'Bridge routes, token references, and cross-chain operational context.',
  },
  defi: {
    title: 'DeFi',
    subtitle: 'Liquidity, farms, and protocol-level PulseChain positions.',
  },
};

export function readStoredActiveTab(): ActiveTab {
  if (typeof window === 'undefined') return 'home';
  const saved = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  if (saved === 'wallets') return 'assets';
  return ACTIVE_TABS.includes(saved as ActiveTab) ? (saved as ActiveTab) : 'home';
}

export function buildAppShellController(activeTab: ActiveTab) {
  const mobilePrimaryNavItems = APP_NAV_ITEMS.filter((item) => MOBILE_PRIMARY_TAB_IDS.includes(item.id));
  const mobileMoreNavItems = APP_NAV_ITEMS.filter((item) => !MOBILE_PRIMARY_TAB_IDS.includes(item.id));

  return {
    navItems: APP_NAV_ITEMS,
    pageMeta: APP_PAGE_META,
    mobilePrimaryNavItems,
    mobileMoreNavItems,
    mobileMoreActive: mobileMoreNavItems.some((item) => item.id === activeTab),
  };
}
