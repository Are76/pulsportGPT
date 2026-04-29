export interface WalletSelectorProps {
  wallets: string[];
  activeWallet: string | null;
  onSelect: (addr: string | null) => void;
  onAdd: () => void;
  onRemove?: (addr: string) => void;
  walletLabels?: Record<string, string>;
}

const WALLET_DOT_COLORS = [
  '#00FF9F', '#f739ff', '#627EEA', '#f97316',
  '#a855f7', '#f59e0b', '#06b6d4', '#ec4899',
];

function shortenAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletSelector({
  wallets,
  activeWallet,
  onSelect,
  onAdd,
  onRemove,
  walletLabels = {},
}: WalletSelectorProps) {
  if (wallets.length === 0) {
    return (
      <button onClick={onAdd} className="btn-ghost" style={{ fontSize: 12, gap: 6 }}>
        <span style={{ fontSize: 14 }}>+</span> Add Wallet
      </button>
    );
  }

  return (
    <div className="wallet-selector-bar">
      <button
        className={`wallet-pill${activeWallet === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
      >
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
            style={
              isActive
                ? {
                    background: `${dotColor}1a`,
                    borderColor: `${dotColor}55`,
                    color: dotColor,
                  }
                : undefined
            }
          >
            <span
              onClick={() => onSelect(addr)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <span
                className="wallet-dot"
                style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}bb` }}
              />
              {label}
            </span>
            {onRemove && (
              <button
                className="wallet-pill-x"
                onClick={(e) => { e.stopPropagation(); onRemove(addr); }}
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
