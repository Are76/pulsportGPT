import type { ShellNavItem, ShellView } from './shell-types';
import { BRAND_ASSETS } from '../branding/brand-assets';

const NAV_ITEMS: ShellNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dash' },
  { id: 'portfolio', label: 'Portfolio', shortLabel: 'Portfolio' },
  { id: 'wallet-analyzer', label: 'Wallet Analyzer', shortLabel: 'Analyzer' },
  { id: 'investments', label: 'My Investments', shortLabel: 'Investments' },
  { id: 'transactions', label: 'Transactions', shortLabel: 'Transactions' },
  { id: 'staking', label: 'HEX Staking', shortLabel: 'Staking' },
  { id: 'wallets-bridges', label: 'Wallets & Bridges', shortLabel: 'Wallets' },
  { id: 'ecosystem', label: 'Ecosystem', shortLabel: 'Ecosystem' },
];

type AppNavProps = {
  activeView: ShellView;
  onNavigate: (view: ShellView) => void;
};

export function AppNav({ activeView, onNavigate }: AppNavProps) {
  return (
    <>
      <div className="app-shell__brand">
        <div className="app-shell__brand-mark">
          <img src={BRAND_ASSETS.logo} alt="Pulseport logo" />
        </div>
        <img className="app-shell__wordmark" src={BRAND_ASSETS.wordmark} alt="Pulseport wordmark" />
      </div>
      <nav aria-label="Primary" className="app-shell__nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === activeView}
            onClick={() => onNavigate(item.id)}
          >
            <span className="app-shell__nav-label">{item.label}</span>
            <span className="app-shell__nav-short">{item.shortLabel}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
