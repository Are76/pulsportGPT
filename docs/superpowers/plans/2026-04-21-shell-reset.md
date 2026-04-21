# Shell Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset Pulseport to a cleaner, GoPulse-inspired left-sidebar shell with a stronger homepage and a denser, more useful transactions page.

**Architecture:** Keep the existing Vite React app and current data model, but simplify the navigation and page framing. Reuse the current transaction and investment logic, while replacing the top-heavy shell with a left-sidebar layout and rebuilding the homepage around a personal summary plus a curated PulseBoard grid.

**Tech Stack:** React, TypeScript, Vite, existing CSS in `src/index.css`, Vitest

---

## File Structure

- `src/App.tsx`
  - Main shell, route rendering, nav items, homepage composition, transactions page composition
- `src/index.css`
  - Shell layout, left sidebar, homepage PulseBoard, transaction page layout rules
- `src/components/TransactionList.tsx`
  - Existing expandable transaction rows; preserve behavior, only adjust if layout gaps remain
- `src/test/build-investment-rows.test.ts`
  - Keep attribution regression coverage untouched
- `src/test/my-investments-page.test.tsx`
  - Keep My Investments page coverage untouched
- `src/test/app-shell-reset.test.tsx`
  - New shell/navigation regression checks for removed nav items and left-sidebar rendering

---

### Task 1: Lock The New Navigation Model

**Files:**
- Modify: `src/App.tsx`
- Create: `src/test/app-shell-reset.test.tsx`

- [ ] **Step 1: Write the failing navigation test**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('shell reset navigation', () => {
  it('shows the simplified primary nav and hides bridge/ecosystem entries', () => {
    render(<App />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByText('HEX Staking')).toBeInTheDocument();
    expect(screen.getByText('My Investments')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('DeFi')).toBeInTheDocument();

    expect(screen.queryByText('Bridges')).not.toBeInTheDocument();
    expect(screen.queryByText('Ecosystem')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/app-shell-reset.test.tsx`
Expected: FAIL because the current nav still includes removed entries.

- [ ] **Step 3: Update the nav model in `src/App.tsx`**

```tsx
type ActiveTab = 'home' | 'overview' | 'stakes' | 'history' | 'defi' | 'pulsechain-official';

const ACTIVE_TABS: ActiveTab[] = [
  'home',
  'overview',
  'stakes',
  'pulsechain-official',
  'history',
  'defi',
];

const navItems = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'overview', label: 'Portfolio', icon: LayoutDashboard },
  { id: 'stakes', label: 'HEX Staking', icon: Landmark },
  { id: 'pulsechain-official', label: 'My Investments', icon: Zap },
  { id: 'history', label: 'Transactions', icon: History },
  { id: 'defi', label: 'DeFi', icon: Layers3 },
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/app-shell-reset.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/test/app-shell-reset.test.tsx
git commit -m "feat: simplify primary navigation"
```

### Task 2: Restore The Left Sidebar Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `src/test/app-shell-reset.test.tsx`

- [ ] **Step 1: Extend the shell test to assert left-sidebar framing**

```tsx
it('renders the app in a sidebar shell without top nav duplication', () => {
  render(<App />);

  expect(document.querySelector('.app-sidebar')).toBeTruthy();
  expect(document.querySelector('.mobile-bottom-nav')).toBeTruthy();
  expect(screen.queryAllByText('Transactions').length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Run test to verify current shell does not match cleanly**

Run: `npm run test -- src/test/app-shell-reset.test.tsx`
Expected: FAIL or be too weak until the shell class usage is corrected.

- [ ] **Step 3: Replace top-heavy framing in `src/App.tsx`**

```tsx
<div className="app-shell">
  <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
    {/* branding */}
    {/* primary nav */}
  </aside>

  <div className="app-main-shell">
    <header className="app-topbar">
      {/* wallet status, refresh, API state */}
    </header>

    <main className="app-page-frame">
      {/* active page content */}
    </main>
  </div>
</div>
```

- [ ] **Step 4: Add the shell CSS in `src/index.css`**

```css
.app-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--bg-app);
}

.app-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 18px 14px;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-sidebar) 92%, #000 8%);
}

.app-main-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
}

.app-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
}

.app-page-frame {
  padding: 18px;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/test/app-shell-reset.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/index.css src/test/app-shell-reset.test.tsx
git commit -m "feat: restore left sidebar shell"
```

### Task 3: Rebuild The Homepage Around Capital Stack And PulseBoard

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Define the homepage layout sections in `src/App.tsx`**

```tsx
{activeTab === 'home' && (
  <motion.div key="home" className="home-reset-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <section className="home-reset-hero">
      <div className="capital-stack">
        {/* portfolio value, invested fiat, net pnl, liquid, staked, quick actions */}
      </div>
      <div className="pulseboard-grid">
        {/* curated PulseChain coin cards */}
      </div>
    </section>

    <section className="home-reset-grid">
      {/* holdings */}
      {/* transactions preview */}
      {/* staking preview */}
    </section>
  </motion.div>
)}
```

- [ ] **Step 2: Build the Capital Stack with existing summary data**

```tsx
<div className="capital-stack-card capital-stack-card--primary">
  <span>Portfolio Value</span>
  <strong>${summary.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
  <small>{summary.totalPls.toLocaleString('en-US', { maximumFractionDigits: 0 })} PLS</small>
</div>
<div className="capital-stack-grid">
  <div className="capital-stat"><span>Invested Fiat</span><strong>${Math.abs(summary.netInvestment).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></div>
  <div className="capital-stat"><span>Net P&L</span><strong>${(summary.totalValue - Math.abs(summary.netInvestment)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></div>
  <div className="capital-stat"><span>Liquid</span><strong>${summary.liquidValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></div>
  <div className="capital-stat"><span>Staked</span><strong>${summary.stakingValueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></div>
</div>
```

- [ ] **Step 3: Build a curated PulseBoard grid in `src/App.tsx`**

```tsx
const pulseBoardSymbols = ['PLS', 'PLSX', 'INC', 'HEX', 'eHEX', 'pDAI', 'PRVX', 'MOST'];
const pulseBoardAssets = pulseBoardSymbols
  .map(symbol => currentAssets.find(asset => asset.symbol === symbol))
  .filter(Boolean);
```

```tsx
<div className="pulseboard-grid">
  {pulseBoardAssets.map(asset => (
    <button key={asset!.id} type="button" className="pulseboard-card" onClick={() => { setTxAssetFilter(asset!.symbol); setActiveTab('history'); }}>
      <div className="pulseboard-card-head">
        <span>{asset!.symbol}</span>
        <em>{(asset!.priceChange24h ?? 0) >= 0 ? '+' : ''}{(asset!.priceChange24h ?? 0).toFixed(2)}%</em>
      </div>
      <strong><PriceDisplay price={asset!.price} /></strong>
      <small>{asset!.name}</small>
    </button>
  ))}
</div>
```

- [ ] **Step 4: Add homepage reset styles in `src/index.css`**

```css
.home-reset-page {
  display: grid;
  gap: 18px;
}

.home-reset-hero {
  display: grid;
  grid-template-columns: minmax(340px, .95fr) minmax(0, 1.05fr);
  gap: 16px;
}

.capital-stack,
.home-reset-grid {
  display: grid;
  gap: 14px;
}

.pulseboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pulseboard-card {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,.01));
  text-align: left;
}
```

- [ ] **Step 5: Run the app-level checks**

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat: rebuild dashboard around capital stack and pulseboard"
```

### Task 4: Simplify Transactions Page Framing And Restore Detail Priority

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/components/TransactionList.tsx` (only if needed)

- [ ] **Step 1: Remove large top intro and start the page with utility controls**

```tsx
{activeTab === 'history' && (
  <motion.div key="history" className="transaction-reset-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="transaction-reset-toolbar">
      <div>
        <strong>Transactions</strong>
        <span>{filteredTransactions.length} rows</span>
      </div>
      <div className="transaction-reset-actions">
        {/* view as you, compact, csv */}
      </div>
    </div>

    <div className="transaction-reset-filters">
      {/* current filter selects */}
    </div>

    {/* conditional asset pnl summary */}
    {/* transaction list */}
  </motion.div>
)}
```

- [ ] **Step 2: Keep the rich asset-specific summary only when filtering by asset**

```tsx
{txAssetFilter !== 'all' && (
  <section className="transaction-asset-summary">
    {/* current realized / holdings / gas / then-vs-now summary card */}
  </section>
)}
```

- [ ] **Step 3: Add denser transaction page styling in `src/index.css`**

```css
.transaction-reset-page {
  display: grid;
  gap: 12px;
}

.transaction-reset-toolbar,
.transaction-reset-filters,
.transaction-asset-summary {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-surface);
}

.transaction-reset-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.transaction-reset-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
}
```

- [ ] **Step 4: Tighten TransactionList card density only if the page still feels bloated**

```tsx
<div className={`tx-card${compact ? ' tx-card--compact' : ''} tx-card--dense`}>
```

```css
.tx-card--dense {
  padding: 10px 12px;
}
```

- [ ] **Step 5: Run the relevant checks**

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/index.css src/components/TransactionList.tsx
git commit -m "feat: compact transactions page and restore detail priority"
```

### Task 5: Re-align Existing Pages To The New Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `src/test/my-investments-page.test.tsx`

- [ ] **Step 1: Remove page-level top spacing and duplicate headers from My Investments and Staking routes**

```tsx
<MyInvestmentsPage
  investedFiat={...}
  currentValue={...}
  liquidValue={...}
  stakedValue={...}
  rows={investmentRows}
  onOpenPlanner={() => setProfitPlannerOpen(true)}
  onOpenTransactions={(row) => { setTxAssetFilter(row.symbol); setActiveTab('history'); }}
/>
```

Use the component directly inside `app-page-frame` without wrapping it in another tall intro block.

- [ ] **Step 2: Add shared page-frame spacing rules**

```css
.app-page-frame > .my-investment-page,
.app-page-frame > .transaction-reset-page,
.app-page-frame > .home-reset-page {
  margin-top: 0;
}
```

- [ ] **Step 3: Re-run the existing My Investments tests**

Run: `npm run test -- src/test/my-investments-page.test.tsx src/test/build-investment-rows.test.ts src/test/app-shell-reset.test.tsx`
Expected: PASS

- [ ] **Step 4: Run full verification**

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css src/test/app-shell-reset.test.tsx
git commit -m "feat: align pages to reset shell"
```

## Spec Coverage Check

- Navigation reset: covered by Task 1
- Left sidebar shell: covered by Task 2
- Homepage Capital Stack + PulseBoard: covered by Task 3
- Transactions list-first dense reset: covered by Task 4
- Keep My Investments attribution and align to shell: covered by Task 5
- Prepare HEX Staking to follow the shell: partially covered by Task 5 framing; full staking redesign is intentionally deferred

## Notes

- Do not add new bridge or ecosystem content during this pass.
- Do not rewrite the data-fetching layer during this pass.
- Keep exact asset identity rules intact.
- Prefer minimal logic changes and larger layout/composition changes.
