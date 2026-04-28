# PulsePort Codebase Architecture Report

## Purpose

This report documents the current PulsePort architecture after the Phase 1-3 foundation work for unified data access, PulseChain transaction ingestion, analytics, and the Wallet Analyzer. It focuses on how the system is structured today, where the main quality risks are, and which boundaries are strong enough to build on.

The goal is not to redesign the whole app. The goal is to identify the smallest structural changes that improve maintainability without changing user-facing behavior.

## Current Application Shape

PulsePort is a client-heavy Vite + React application with a large root orchestration layer in [src/App.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/App.tsx). The app still relies on root-level state assembly for wallets, assets, transactions, history, summaries, UI routing, and page-specific interaction adapters.

The codebase now has a stronger domain split than it had before:

- `src/services/`
  Owns data-access responsibilities and shared network-facing logic.
- `src/utils/`
  Owns normalization, investment-row building, exports, analytics, and view-model helpers.
- `src/pages/`
  Owns page-level rendering entry points.
- `src/components/`
  Owns reusable UI sections and feature-specific components.

This is meaningful progress, but the root app layer still consumes too many of those domains directly.

## Key Boundaries

### Data Access

The new service layer is the cleanest architecture boundary in the repo:

- [src/services/dataAccess.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/services/dataAccess.ts)
- [src/services/priceService.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/services/priceService.ts)
- PulseChain adapter and cache helpers under `src/services/`

This layer is responsible for:

- token balances
- LP positions
- transactions
- price resolution
- caching and batching

This is a good long-term boundary and should be preserved.

### Transaction and Attribution Pipeline

The transaction and attribution path is now more explicit:

- [src/utils/fetchTransactions.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/utils/fetchTransactions.ts)
- [src/utils/normalizeTransactions.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/utils/normalizeTransactions.ts)
- [src/utils/buildInvestmentRows.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/utils/buildInvestmentRows.ts)
- [src/utils/transactionExport.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/utils/transactionExport.ts)

This pipeline is now good enough to support further analytics work, but app-level transaction opening still depends on row-shaped UI contracts rather than explicit history filter intents.

### Analytics and Wallet Analyzer

The analytics path has a usable internal structure:

- [src/utils/portfolioAnalytics.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/utils/portfolioAnalytics.ts)
- [src/utils/buildWalletAnalyzerModel.ts](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/utils/buildWalletAnalyzerModel.ts)
- [src/pages/WalletAnalyzer.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/pages/WalletAnalyzer.tsx)
- `src/components/wallet-analyzer/*`

This is the best current seam for app decomposition because the analyzer already has:

- dedicated domain logic
- a page boundary
- isolated tests
- an app-facing callback contract

## Data Flow Summary

Today’s main data flow is:

1. `dataAccess` and related services fetch balances, prices, positions, and transactions.
2. `App.tsx` assembles wallet state, history, transactions, and asset snapshots.
3. Utility functions derive normalized transactions, investment rows, exports, analytics inputs, and Wallet Analyzer view data.
4. Pages and components render those derived outputs and send interactions back upward through root callbacks.

This flow is workable, but too much of the orchestration remains centralized in `App.tsx`.

## Structural Problems

### 1. Root Responsibility Concentration

[src/App.tsx](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/App.tsx) is the dominant architectural risk. It is currently 6675 lines and mixes:

- network orchestration
- local persistence helpers
- page routing
- derived portfolio summaries
- export actions
- chart/view formatting helpers
- Wallet Analyzer wiring
- transaction drill-down bridging

This increases regression risk because unrelated features share one edit surface.

### 2. Global Styling Concentration

[src/index.css](C:/Users/areje/OneDrive/Apper/Claude%20code/pulseport-community/.worktrees/codex-dashboardweb-phase-1-data-foundation/src/index.css) is currently 12319 lines. It now contains global layout, page styles, analyzer styles, and utility styling in one file.

This is a maintainability problem because:

- feature changes require global CSS edits
- dead-style detection becomes difficult
- style collisions become more likely
- design work scales poorly across pages

### 3. UI-Driven Drill-Down Contracts

Several interactions still work by passing an `InvestmentHoldingRow` back into app-level state handlers. That was a useful transitional step, but it is not a durable navigation contract.

The main issue is that user intent is:

- open chain history
- open asset history
- open bridge history
- open staking history

but the current contract is:

- open transactions for this row

That difference will matter more as analyzer and history views deepen.

### 4. Mixed Root Derivation Responsibilities

`App.tsx` currently derives multiple view models directly:

- top holdings and market cards
- investment rows
- Wallet Analyzer prices
- Wallet Analyzer model
- page-level display sets

These are valid derivations, but they should not all live at the app root.

## Duplicated or Repeated Logic

The codebase has improved here, but some repetition remains:

- repeated app-level mapping from holdings or chains back to transaction-opening behavior
- repeated formatting and display preparation in page-or-root render logic
- repeated dependence on broad shared state rather than page-focused inputs

This is not the worst current problem, but it is a signal that some feature boundaries are still too shallow.

## Performance Risks

### 1. Root Recompute Surface

Because `App.tsx` owns many top-level `useMemo` and render branches, broad state updates can touch unrelated derivations. The existing memoization helps, but file size and dependency breadth make performance behavior harder to reason about.

### 2. Large Global CSS Surface

The CSS problem is primarily maintainability, but it also increases rendering/debugging complexity because more selectors and rules are always in play.

### 3. Row-Lookup Navigation Adapters

Current analyzer drill-downs map holdings or chain summaries back to rows at render time. This is acceptable for now, but it is still an adapter layer compensating for the missing typed navigation model.

## Maintainability Risks

The highest maintainability risks are:

- a very large root component
- a very large global stylesheet
- growing page logic that still depends on broad app state
- navigation contracts encoded as UI row adapters instead of typed intents

If left alone, each new feature will likely make `App.tsx` and `index.css` worse even if the data and analytics layers remain clean.

## Recommended Target Architecture

The codebase does not need a rewrite. It needs clearer orchestration boundaries.

Recommended target direction:

- keep `src/services/` as the public data-access layer
- keep `src/utils/` for pure domain logic and model-building
- move page-specific orchestration behind feature-level hooks or controllers
- narrow page callbacks to typed intents instead of row objects
- isolate large feature styling from `index.css`

The first safe seam is the Wallet Analyzer.

## Recommended First Refactor Slice

The first refactor slice should target Wallet Analyzer orchestration in `App.tsx`.

Why this slice:

- the feature already has a stable page boundary
- analytics and model-building already exist
- its wiring is localized enough to extract without changing fetch behavior
- it reduces root complexity without forcing a whole-app rearchitecture

That slice should:

- move analyzer-specific derived-state assembly behind a focused feature boundary
- move analyzer drill-down adapters out of the broad app render block
- preserve the existing UI and behavior exactly

## Non-Goals

This report does not recommend:

- converting the app to a new framework
- introducing a global state library just for cleanup
- rewriting all pages into a new architecture in one pass
- changing user-visible behavior during the first decomposition slice

Those would increase risk without solving the immediate structural bottleneck.

## Conclusion

PulsePort is now in a better architectural position than it was before the unified service and analytics work. The strongest parts of the codebase are now the service layer, transaction/attribution utilities, and Wallet Analyzer domain logic.

The main remaining risk is not missing functionality. It is orchestration concentration in `App.tsx` and styling concentration in `index.css`.

The right next move is an incremental refactor that starts with Wallet Analyzer extraction from the app root, then formalizes navigation intents, then isolates feature styles, then continues with broader root decomposition.
