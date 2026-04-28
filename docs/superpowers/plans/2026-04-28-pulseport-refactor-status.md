# PulsePort Refactor Status

Date: 2026-04-28

## Completed

### App-level controllers and boundaries

- `src/features/app-shell/appShellController.ts`
- `src/features/history/useHistoryController.ts`
- `src/features/portfolio/usePortfolioSummaryController.ts`
- `src/features/wallet-analyzer/buildWalletAnalyzerPageProps.ts`
- `src/features/history/historyDrilldown.ts`

### Portfolio fetch path

- `src/features/portfolio/createPortfolioFetchController.ts`
- `src/features/portfolio/loadWalletChainData.ts`
- `src/features/portfolio/loadHexStakes.ts`
- `src/features/portfolio/buildPortfolioSnapshot.ts`
- `src/features/portfolio/loadPulsechainLiquidity.ts`
- `src/features/portfolio/enrichPulsechainMissingPrices.ts`
- `src/features/portfolio/discoveredTokenDiscovery.ts`
- `src/features/portfolio/discoveredTokenLoader.ts`

### Styles and page isolation

- `src/styles/wallet-analyzer.css`

## What These Refactors Changed

Before this work:
- `src/App.tsx` owned cross-chain transaction loading
- `src/App.tsx` owned PulseChain-specific discovered-token logic
- `src/App.tsx` owned HEX stake loading
- `src/App.tsx` owned LP/farm batch RPC logic
- `src/App.tsx` owned portfolio snapshot shaping
- Wallet Analyzer interactions were more tightly coupled to row objects and inline state shaping

Now:
- the root component delegates portfolio loading to a controller
- chain loaders are feature modules rather than inline branches
- portfolio snapshot construction is a pure builder
- Wallet Analyzer page props and drill-downs are explicit feature boundaries
- history filtering is handled through typed intents instead of only row-coupled behavior

## Remaining Refactor Targets

### Still reasonable

- extract token market-data fetch effects from `src/App.tsx`
- isolate more UI-only helpers that do not need root ownership
- continue shrinking `src/App.tsx` around presentation composition

### Not currently necessary

- rewriting the portfolio fetch path again
- reintroducing a global store before there is a demonstrated need
- migrating every utility into `dataAccess` just for symmetry

## Recommendation

Do not pause feature work because `src/App.tsx` is still large.

The high-value refactor slices have already landed:
- data access is cross-chain for core paths
- portfolio loading is modularized
- analyzer and history state have dedicated boundaries

Future refactors should stay opportunistic and targeted rather than trying to force a “finish every extraction first” rewrite.
