# Pulseport Phase 1 Data Foundation Design

Date: 2026-04-25
Project: Pulseport Community
Phase: `Portfolio Analytics Foundation`

## Goal

Build the first safe foundation for Pulseport's broader portfolio analytics work by extracting PulseChain-first data fetching into a unified service layer, adding deterministic price fallback, and reducing duplicated RPC/subgraph logic in the existing hooks.

This phase is intentionally infrastructure-first. It should leave the app behavior largely unchanged while creating stable interfaces for later PulseChain transaction ingestion, analytics, and Wallet Analyzer UI work.

## Scope

In scope:

- Unified client-side data-access facade for portfolio reads
- PulseChain-first live adapters for LP positions, token search, balances, and prices
- Deterministic price fallback order
- Shared caching and RPC batching utilities
- Migration of existing hooks onto the new services
- Unit tests for the new services and unchanged regression coverage for current investment logic

Out of scope:

- Full PulseChain transaction ingestion
- Bridge detection
- New cost-basis math for PulseChain history
- Portfolio analytics engine
- Wallet Analyzer page and chart components
- CSV/JSON export flows
- Server-side API introduction

## Constraints And Assumptions

- The current app is a client-side `Vite` + `React` + `Electron` codebase with no existing portfolio backend. Phase 1 should not introduce a new server layer.
- `useLiquidityPositions.ts` currently owns PulseChain RPC batching and subgraph enrichment. `useTokenSearch.ts` currently owns PulseX subgraph search logic. These are the primary duplication points to extract.
- `buildInvestmentRows.ts` remains functionally unchanged in this phase because complete PulseChain transaction history is not yet available.
- Deterministic price fallback means:
  1. PulseX-derived price when available
  2. CoinGecko for explicitly mapped assets
  3. `null` for unpriced assets
- Exact asset identity remains contract-first and chain-scoped. Symbol-only merging is unsafe on PulseChain.

## Product Decision

Phase 1 will add a unified client-side service facade now, not a backend adapter.

Reasoning:

- It fits the repo's current architecture.
- It removes the highest-friction duplication without introducing deployment and API complexity.
- It creates a stable seam for a future backend adapter if rate limits or data volume require one later.

## Architecture

### Public Entry Point

`src/services/dataAccess.ts` becomes the single public read interface for portfolio data.

It should expose:

- `getTokenBalances(address, chain)`
- `getTransactions(address, chain, startBlock?)`
- `getLPPositions(addresses, chain, tokenPrices)`
- `getPrices(tokenAddresses, chain)`
- `searchTokens(term, chain)`

In Phase 1, `getTransactions` exists as a typed boundary and returns an explicit not-yet-implemented result for all chains. The other methods are live for `pulsechain`.

### Chain Adapter Boundary

PulseChain-specific network work moves behind a dedicated adapter layer under `src/services/adapters/`.

Recommended first file:

- `src/services/adapters/pulsechainAdapter.ts`

Responsibilities:

- PulseChain RPC batching with fallback RPC URLs
- PulseX subgraph queries
- LP reserve and staking reads
- Token search normalization
- Token balance reads
- PulseChain-native price derivation inputs

This file should not contain React hook state or component-specific shaping.

### Shared Infrastructure

Shared infra should be small and purpose-built:

- `src/services/cache.ts`
  - TTL cache helpers for short-lived in-memory memoization
- `src/services/priceService.ts`
  - USD price resolution and fallback policy

The cache is for repeated metadata, price lookups, and repeated chain reads within a short refresh window. It is not a global app store.

## File Structure

### New files

- `src/services/cache.ts`
  - Tiny TTL memoization helpers shared by data services.
- `src/services/dataAccess.ts`
  - Public facade used by hooks and future analytics code.
- `src/services/priceService.ts`
  - Price aggregation and deterministic fallback behavior.
- `src/services/adapters/pulsechainAdapter.ts`
  - PulseChain RPC + subgraph implementation details.
- `src/test/data-access.test.ts`
  - Service-level tests for cache, token search normalization, LP position loading, and price fallback.

### Modified files

- `src/hooks/useLiquidityPositions.ts`
  - Convert from network-heavy hook to thin React wrapper over the service facade.
- `src/hooks/useTokenSearch.ts`
  - Convert from direct subgraph hook to thin wrapper over the service facade.
- `src/types.ts`
  - Add any minimal service-facing types needed for balances, price results, and transaction boundary typing.

### Intentionally unchanged files

- `src/utils/buildInvestmentRows.ts`
- `src/utils/normalizeTransactions.ts`
- `src/test/build-investment-rows.test.ts`

These remain the regression boundary for later phases.

## Data Contracts

The new service layer should introduce explicit typed results instead of leaking hook-local shapes.

Minimum new types to add in `src/types.ts`:

- `TokenBalance`
  - `address`
  - `symbol`
  - `name`
  - `decimals`
  - `balance`
  - `chain`
- `PriceQuote`
  - `tokenAddress`
  - `chain`
  - `priceUsd`
  - `source`
- `TransactionQueryResult`
  - `transactions`
  - `cursor` or `nextBlock` if needed later
  - `implemented`

`LpPositionEnriched` and the existing token-search result shape can be reused where practical instead of introducing speculative replacement types.

## Pricing Strategy

`src/services/priceService.ts` owns all price resolution policy.

Priority order:

1. PulseX-derived price when the token has usable PulseX liquidity
2. CoinGecko mapping for known assets that lack sufficient PulseX pricing
3. `null` when no reliable price exists

Rules:

- No heuristic bridged-asset inference in Phase 1
- No symbol-only fallback
- Cache successful and null results separately with short TTLs
- Return source metadata so later UI can explain pricing origin if needed

## Hook Migration

### `useLiquidityPositions.ts`

After migration, the hook should only:

- manage loading/error state
- call `dataAccess.getLPPositions(...)`
- expose `positions`, `loading`, `error`, `refetch`

It should no longer own:

- RPC batching helpers
- subgraph fetch helpers
- pair-level normalization logic

### `useTokenSearch.ts`

After migration, the hook should only:

- debounce the user input
- call `dataAccess.searchTokens(...)`
- expose `data`, `isLoading`, `isError`, `noResults`

It should no longer own:

- direct subgraph URL knowledge
- GraphQL query construction
- result deduplication and sort policy

## Testing Strategy

Phase 1 should be implemented test-first where behavior changes or service boundaries are introduced.

Required test coverage:

- `cache.ts`
  - returns cached values within TTL
  - recomputes after TTL expires
- `priceService.ts`
  - uses PulseX-derived price first
  - falls back to CoinGecko mapping when PulseX price is unavailable
  - returns `null` when neither source can price the token
- `dataAccess.ts` / `pulsechainAdapter.ts`
  - normalizes token search results
  - preserves LP position shaping expected by current consumers
  - rejects unsupported chains clearly in Phase 1
- Regression:
  - existing `buildInvestmentRows` tests must still pass unchanged

Tests should prefer service-level mocks over React rendering unless the hook behavior itself is under test.

## Success Criteria

Phase 1 is successful when:

- the app still compiles and existing investment behavior is unchanged
- `useLiquidityPositions` and `useTokenSearch` no longer embed direct network logic
- PulseChain data reads run through a single facade
- price resolution follows one deterministic path
- unsupported features are surfaced through stable typed boundaries instead of missing functions
- the new service layer is covered by focused unit tests

## Risks And Mitigations

### Risk: accidental behavior drift in LP and token search displays

Mitigation:

- keep current output shapes where possible
- add tests around current hook-consumer expectations

### Risk: over-engineering the abstraction before PulseChain transaction ingestion exists

Mitigation:

- keep `getTransactions` as a thin typed boundary only
- do not add analytics-specific abstractions in this phase

### Risk: too much churn across unrelated files

Mitigation:

- restrict edits to services, the two hooks, and minimal shared types
- leave cost-basis and UI pages untouched

## Future Handoff

This phase should make the next implementation phases straightforward:

- Phase 2 can plug PulseChain transaction ingestion into `getTransactions(...)`
- Phase 3 can consume `dataAccess` and `priceService` from analytics code without reaching back into hooks
- Phase 4 can build the Wallet Analyzer page against stable service and analytics boundaries
