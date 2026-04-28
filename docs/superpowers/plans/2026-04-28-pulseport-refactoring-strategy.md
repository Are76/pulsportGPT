# PulsePort Refactoring Strategy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce root orchestration risk in PulsePort without changing functionality, starting with a safe extraction of Wallet Analyzer wiring from `App.tsx`.

**Architecture:** Preserve the existing service, transaction, and analytics layers. Refactor by extracting focused app-facing feature boundaries rather than introducing new global abstractions. Start at the Wallet Analyzer seam because it already has a page boundary, a model builder, and isolated tests.

**Tech Stack:** React, TypeScript, Vite, Vitest, existing utility/model-builder pattern

---

## File Structure

### Existing Files to Modify First

- [src/App.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/App.tsx)
  Root orchestration and current Wallet Analyzer wiring.
- [src/pages/WalletAnalyzer.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/pages/WalletAnalyzer.tsx)
  Wallet Analyzer page component.
- [src/test/wallet-analyzer.test.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/test/wallet-analyzer.test.tsx)
  Feature behavior tests.
- [src/test/page-routing.test.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/test/page-routing.test.tsx)
  Route integration coverage.

### New Files for Slice A

- `src/features/wallet-analyzer/buildWalletAnalyzerPageProps.ts`
  Focused feature boundary that assembles Wallet Analyzer page props from app-owned inputs.
- `src/features/wallet-analyzer/walletAnalyzerTypes.ts`
  Narrow feature-facing types for analyzer drill-down intent and app adapter boundaries.
- `src/test/wallet-analyzer-page-props.test.ts`
  Unit tests for the extracted feature boundary.

### Later Slices

- Slice B will add typed history filter intent files under `src/features/history/`.
- Slice C will split Wallet Analyzer styles from `src/index.css`.
- Slice D will extract broader root controllers.

## Phase Order

### Phase A: Wallet Analyzer App Decomposition

Move analyzer-specific page prop assembly out of `App.tsx` and behind a feature-level builder. Keep existing UI behavior, page routing, and transaction opening behavior unchanged.

### Phase B: Typed History Drill-Down Intents

Replace row-based navigation callbacks with explicit filter payloads for chain, asset, bridge, and staking contexts.

### Phase C: Feature Style Isolation

Move Wallet Analyzer styling out of `src/index.css`, then repeat for other high-churn feature areas.

### Phase D: Broader Root Controller Extraction

Extract transaction loading, portfolio summary derivation, and page-routing orchestration from `App.tsx`.

---

## Slice A Scope

Slice A is intentionally narrow.

### In Scope

- extract analyzer-specific page prop assembly from `App.tsx`
- extract analyzer-specific row lookup adapters from `App.tsx`
- keep the same `WalletAnalyzerPage` rendering behavior
- keep the same routing behavior
- keep the same tests green

### Out of Scope

- changing analyzer visuals
- changing analyzer calculations
- changing transaction history filtering behavior
- splitting `index.css`
- changing service or fetch behavior

---

## Task 1: Add a Feature Boundary for Wallet Analyzer Page Props

**Files:**
- Create: `src/features/wallet-analyzer/buildWalletAnalyzerPageProps.ts`
- Create: `src/features/wallet-analyzer/walletAnalyzerTypes.ts`
- Test: `src/test/wallet-analyzer-page-props.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildWalletAnalyzerPageProps } from '../features/wallet-analyzer/buildWalletAnalyzerPageProps';

describe('buildWalletAnalyzerPageProps', () => {
  it('builds analyzer page props and resolves drill-down lookups', () => {
    const onOpenTransactions = vi.fn();
    const investmentRows = [
      {
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        chain: 'ethereum',
        currentValue: 700,
        costBasis: 600,
        pnlUsd: 100,
        pnlPercent: 16.6,
        sourceMix: [],
        routeSummary: 'Ethereum',
        thenValue: 600,
        nowValue: 700,
      },
    ];

    const result = buildWalletAnalyzerPageProps({
      model: {
        summaryCards: [],
        riskMetrics: { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, diversificationScore: 0 },
        behavior: { averageHoldingPeriodDays: 0, realizedGainsUsd: 0, unrealizedGainsUsd: 0, realizedShare: 0 },
        allocation: [{ symbol: 'ETH', chain: 'ethereum', valueUsd: 700, weight: 1 }],
        contributors: [{ symbol: 'ETH', chain: 'ethereum', currentValue: 700, moveUsd: 100, weight: 1 }],
        chainMix: [{ chain: 'ethereum', valueUsd: 700, weight: 1, moveUsd: 100 }],
        performance: [],
        benchmark: [],
      } as any,
      investmentRows: investmentRows as any,
      plsUsdPrice: 0.00008,
      onOpenTransactions,
    });

    result.onOpenTransactionsForHolding({ symbol: 'ETH', chain: 'ethereum' } as any);

    expect(result.pageProps.plsUsdPrice).toBe(0.00008);
    expect(onOpenTransactions).toHaveBeenCalledWith(expect.objectContaining({ id: 'eth' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/wallet-analyzer-page-props.test.ts`
Expected: FAIL with module or symbol not found for `buildWalletAnalyzerPageProps`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { InvestmentHoldingRow } from '../../components/HoldingsTable';

type BuildWalletAnalyzerPagePropsArgs = {
  model: any;
  investmentRows: InvestmentHoldingRow[];
  plsUsdPrice: number;
  onOpenTransactions: (row: InvestmentHoldingRow) => void;
};

const toHoldingKey = (chain: string, symbol: string) => `${chain}:${symbol}`.toUpperCase();

export function buildWalletAnalyzerPageProps({
  model,
  investmentRows,
  plsUsdPrice,
  onOpenTransactions,
}: BuildWalletAnalyzerPagePropsArgs) {
  const investmentRowByHolding = new Map(
    investmentRows.map((row) => [toHoldingKey(row.chain, row.symbol), row]),
  );
  const firstInvestmentRowByChain = new Map<string, InvestmentHoldingRow>();

  for (const row of investmentRows) {
    if (!firstInvestmentRowByChain.has(row.chain)) {
      firstInvestmentRowByChain.set(row.chain, row);
    }
  }

  return {
    pageProps: {
      model,
      investmentRows,
      plsUsdPrice,
      onOpenTransactions,
    },
    onOpenTransactionsForHolding(holding: { chain: string; symbol: string }) {
      const row = investmentRowByHolding.get(toHoldingKey(holding.chain, holding.symbol));
      if (row) onOpenTransactions(row);
    },
    onOpenTransactionsForChain(chain: string) {
      const row = firstInvestmentRowByChain.get(chain);
      if (row) onOpenTransactions(row);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/wallet-analyzer-page-props.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/wallet-analyzer/buildWalletAnalyzerPageProps.ts src/features/wallet-analyzer/walletAnalyzerTypes.ts src/test/wallet-analyzer-page-props.test.ts
git commit -m "refactor: extract wallet analyzer page props builder"
```

## Task 2: Move Wallet Analyzer Wiring Out of App.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/WalletAnalyzer.tsx`
- Test: `src/test/wallet-analyzer.test.tsx`
- Test: `src/test/page-routing.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Add an integration assertion that `App.tsx` still renders the Wallet Analyzer page and preserves transaction drill-down behavior after extraction.

```ts
it('keeps wallet analyzer drill-down wiring intact', async () => {
  render(<App />);

  expect(screen.getByText(/wallet analyzer/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run targeted tests to verify baseline**

Run: `npm run test -- src/test/wallet-analyzer.test.tsx src/test/page-routing.test.tsx`
Expected: PASS before refactor, then keep them PASS after refactor

- [ ] **Step 3: Extract the app-facing analyzer builder usage**

In `App.tsx`, replace direct analyzer lookup wiring with the new feature boundary:

```ts
const walletAnalyzerPage = useMemo(() => {
  return buildWalletAnalyzerPageProps({
    model: walletAnalyzerModel,
    investmentRows,
    plsUsdPrice: prices['pulsechain']?.usd || 0,
    onOpenTransactions: handleOpenTransactions,
  });
}, [handleOpenTransactions, investmentRows, prices, walletAnalyzerModel]);
```

Then pass:

```tsx
<WalletAnalyzerPage {...walletAnalyzerPage.pageProps} />
```

Inside the builder-backed props, use adapter callbacks instead of rebuilding row maps inline in the root page render.

- [ ] **Step 4: Keep WalletAnalyzerPage focused on rendering**

Update `WalletAnalyzerPage` so it receives the callbacks it needs rather than assuming root-level row-map logic belongs in the page itself. Keep calculations and rendering behavior unchanged.

```ts
type WalletAnalyzerPageProps = {
  model: WalletAnalyzerModel;
  investmentRows: InvestmentHoldingRow[];
  plsUsdPrice: number;
  onOpenTransactions: (row: InvestmentHoldingRow) => void;
};
```

The page may still receive `investmentRows` for display, but row-map creation and app adapter logic should move to the feature boundary.

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/test/wallet-analyzer.test.tsx src/test/page-routing.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/WalletAnalyzer.tsx src/test/wallet-analyzer.test.tsx src/test/page-routing.test.tsx
git commit -m "refactor: move wallet analyzer wiring out of app root"
```

## Task 3: Verify No Behavior Regressions in the Current Branch

**Files:**
- Verify only

- [ ] **Step 1: Run the Wallet Analyzer tests**

Run: `npm run test -- src/test/wallet-analyzer.test.tsx src/test/wallet-analyzer-page-props.test.ts`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: Run type/lint verification**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Smoke-check the app in dev**

Run: `npm run dev`
Expected: App loads and Wallet Analyzer still renders without visible behavior changes

- [ ] **Step 5: Commit verification-safe state**

```bash
git add -A
git commit -m "test: verify wallet analyzer app decomposition"
```

---

## Self-Review

### Spec Coverage

This strategy covers:

- architecture findings from the report
- phased refactor ordering
- a safe first slice on `App.tsx`
- verification and non-goals for the first slice

### Placeholder Scan

No tasks rely on `TODO`, `TBD`, or implied implementation without code examples.

### Type Consistency

The first slice intentionally preserves the existing `onOpenTransactions(row)` contract. Typed filter intents are deferred to Phase B to keep Slice A behavior-safe.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-pulseport-refactoring-strategy.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
