# Phase 1 Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract PulseChain-first portfolio data reads into a unified service layer with deterministic pricing and migrate the existing LP/token-search hooks onto that foundation without changing portfolio behavior.

**Architecture:** Add a small service layer under `src/services/` with a PulseChain adapter, TTL cache helpers, and a public `dataAccess` facade. Keep React hooks thin, preserve current result shapes where possible, and leave transaction ingestion and analytics as later phases behind a stable interface boundary.

**Tech Stack:** React 19, TypeScript, Vite, native `fetch`, existing PulseX RPC/subgraph endpoints, Vitest.

---

## File Structure

### New files

- `src/services/cache.ts`
  - TTL memoization helpers for short-lived service caching.
- `src/services/adapters/pulsechainAdapter.ts`
  - PulseChain RPC batching, subgraph calls, and normalized read helpers.
- `src/services/priceService.ts`
  - Deterministic price resolution with PulseX-first and CoinGecko fallback behavior.
- `src/services/dataAccess.ts`
  - Public facade consumed by hooks and future analytics code.
- `src/test/data-access.test.ts`
  - Unit coverage for cache behavior, price fallback, and facade normalization.

### Modified files

- `src/types.ts`
  - Add minimal service-facing types.
- `src/hooks/useLiquidityPositions.ts`
  - Replace embedded network logic with a service call.
- `src/hooks/useTokenSearch.ts`
  - Replace embedded subgraph logic with a service call.

### Existing verification targets

- `src/test/build-investment-rows.test.ts`
  - Must continue passing unchanged.

---

### Task 1: Add Service Types And Cache Utilities

**Files:**
- Create: `src/services/cache.ts`
- Modify: `src/types.ts`
- Test: `src/test/data-access.test.ts`

- [ ] **Step 1: Write the failing cache and type test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '../services/cache';
import type { PriceQuote, TokenBalance, TransactionQueryResult } from '../types';

describe('service foundation types and cache', () => {
  it('returns cached values while the ttl is valid', async () => {
    vi.useFakeTimers();
    const cache = createTtlCache<number>({ ttlMs: 1000 });
    const loader = vi.fn(async () => 7);

    await expect(cache.get('answer', loader)).resolves.toBe(7);
    await expect(cache.get('answer', loader)).resolves.toBe(7);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('supports the phase-1 service result types', () => {
    const balance: TokenBalance = {
      address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      symbol: 'WPLS',
      name: 'Wrapped Pulse',
      decimals: 18,
      balance: 42,
      chain: 'pulsechain',
    };

    const quote: PriceQuote = {
      tokenAddress: balance.address,
      chain: 'pulsechain',
      priceUsd: 0.00012,
      source: 'pulsex',
    };

    const txResult: TransactionQueryResult = {
      implemented: false,
      transactions: [],
    };

    expect(quote.source).toBe('pulsex');
    expect(txResult.implemented).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: FAIL with missing `createTtlCache` and missing service-facing types.

- [ ] **Step 3: Write the minimal types and cache utility**

```ts
// src/types.ts
export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  chain: Chain;
}

export interface PriceQuote {
  tokenAddress: string;
  chain: Chain;
  priceUsd: number | null;
  source: 'pulsex' | 'coingecko' | 'unpriced';
}

export interface TransactionQueryResult {
  implemented: boolean;
  transactions: Transaction[];
  nextBlock?: number;
}
```

```ts
// src/services/cache.ts
export function createTtlCache<T>({ ttlMs }: { ttlMs: number }) {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    async get(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const existing = entries.get(key);
      if (existing && existing.expiresAt > now) return existing.value;

      const value = await loader();
      entries.set(key, { value, expiresAt: now + ttlMs });
      return value;
    },
    clear(key?: string) {
      if (key) entries.delete(key);
      else entries.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/services/cache.ts src/test/data-access.test.ts
git commit -m "feat: add phase 1 service cache and types"
```

### Task 2: Extract PulseChain Adapter And Price Service

**Files:**
- Create: `src/services/adapters/pulsechainAdapter.ts`
- Create: `src/services/priceService.ts`
- Test: `src/test/data-access.test.ts`

- [ ] **Step 1: Write the failing adapter and price fallback tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveTokenPrices } from '../services/priceService';
import { searchPulseChainTokens } from '../services/adapters/pulsechainAdapter';

describe('pulsechain adapter', () => {
  it('deduplicates token search results by pair address and sorts by reserve usd', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([
        { pairAddress: '0x2', reserveUSD: '10', token0: { id: 'a' }, token1: { id: 'b' }, version: 'v1' },
      ])
      .mockResolvedValueOnce([
        { pairAddress: '0x1', reserveUSD: '25', token0: { id: 'c' }, token1: { id: 'd' }, version: 'v2' },
        { pairAddress: '0x2', reserveUSD: '10', token0: { id: 'a' }, token1: { id: 'b' }, version: 'v2' },
      ]);

    const results = await searchPulseChainTokens('pls', { fetchSubgraphResults: fetcher as never });

    expect(results.map((item) => item.pairAddress)).toEqual(['0x1', '0x2']);
  });
});

describe('price service', () => {
  it('prefers pulsex pricing over coingecko fallback', async () => {
    const quotes = await resolveTokenPrices(
      ['0xa1077a294dde1b09bb078844df40758a5d0f9a27'],
      'pulsechain',
      {
        getPulseXPrices: async () => ({ '0xa1077a294dde1b09bb078844df40758a5d0f9a27': 0.00012 }),
        getCoinGeckoPrices: async () => ({ '0xa1077a294dde1b09bb078844df40758a5d0f9a27': 0.0002 }),
      },
    );

    expect(quotes[0]).toMatchObject({ priceUsd: 0.00012, source: 'pulsex' });
  });

  it('returns unpriced when neither source can price the token', async () => {
    const quotes = await resolveTokenPrices(
      ['0xdead'],
      'pulsechain',
      {
        getPulseXPrices: async () => ({}),
        getCoinGeckoPrices: async () => ({}),
      },
    );

    expect(quotes[0]).toMatchObject({ tokenAddress: '0xdead', priceUsd: null, source: 'unpriced' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: FAIL with missing adapter and price-service functions.

- [ ] **Step 3: Write the minimal adapter and pricing implementation**

```ts
// src/services/adapters/pulsechainAdapter.ts
import type { TokenSearchResult } from '../../hooks/useTokenSearch';

export async function searchPulseChainTokens(
  term: string,
  deps: {
    fetchSubgraphResults: (version: 'v1' | 'v2', term: string) => Promise<TokenSearchResult[]>;
  },
): Promise<TokenSearchResult[]> {
  const [v1, v2] = await Promise.all([
    deps.fetchSubgraphResults('v1', term),
    deps.fetchSubgraphResults('v2', term),
  ]);

  const seen = new Set<string>();
  return [...v1, ...v2]
    .filter((item) => {
      if (seen.has(item.pairAddress)) return false;
      seen.add(item.pairAddress);
      return true;
    })
    .sort((a, b) => parseFloat(b.reserveUSD) - parseFloat(a.reserveUSD));
}
```

```ts
// src/services/priceService.ts
import type { Chain, PriceQuote } from '../types';

export async function resolveTokenPrices(
  tokenAddresses: string[],
  chain: Chain,
  deps: {
    getPulseXPrices: (addresses: string[], chain: Chain) => Promise<Record<string, number>>;
    getCoinGeckoPrices: (addresses: string[], chain: Chain) => Promise<Record<string, number>>;
  },
): Promise<PriceQuote[]> {
  const pulsex = await deps.getPulseXPrices(tokenAddresses, chain);
  const missing = tokenAddresses.filter((address) => pulsex[address] == null);
  const gecko = missing.length > 0 ? await deps.getCoinGeckoPrices(missing, chain) : {};

  return tokenAddresses.map((tokenAddress) => {
    if (pulsex[tokenAddress] != null) {
      return { tokenAddress, chain, priceUsd: pulsex[tokenAddress], source: 'pulsex' as const };
    }
    if (gecko[tokenAddress] != null) {
      return { tokenAddress, chain, priceUsd: gecko[tokenAddress], source: 'coingecko' as const };
    }
    return { tokenAddress, chain, priceUsd: null, source: 'unpriced' as const };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/adapters/pulsechainAdapter.ts src/services/priceService.ts src/test/data-access.test.ts
git commit -m "feat: add pulsechain adapter and price service"
```

### Task 3: Add The Public Data-Access Facade

**Files:**
- Create: `src/services/dataAccess.ts`
- Test: `src/test/data-access.test.ts`

- [ ] **Step 1: Write the failing facade tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDataAccess } from '../services/dataAccess';

describe('data access facade', () => {
  it('routes pulsechain token search through the pulsechain adapter', async () => {
    const facade = createDataAccess({
      searchPulseChainTokens: vi.fn(async () => [{ pairAddress: '0x1', reserveUSD: '5' }]),
      loadPulseChainLpPositions: vi.fn(async () => []),
      loadPulseChainBalances: vi.fn(async () => []),
      resolvePrices: vi.fn(async () => []),
    });

    const results = await facade.searchTokens('pls', 'pulsechain');

    expect(results).toHaveLength(1);
    expect(facade.getTransactions('0xabc', 'pulsechain')).resolves.toMatchObject({ implemented: false });
  });

  it('rejects unsupported chains for phase-1 live reads', async () => {
    const facade = createDataAccess({
      searchPulseChainTokens: vi.fn(async () => []),
      loadPulseChainLpPositions: vi.fn(async () => []),
      loadPulseChainBalances: vi.fn(async () => []),
      resolvePrices: vi.fn(async () => []),
    });

    await expect(facade.searchTokens('eth', 'ethereum')).rejects.toThrow('not implemented');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: FAIL with missing facade.

- [ ] **Step 3: Write the minimal facade**

```ts
// src/services/dataAccess.ts
import type { Chain, PriceQuote, TokenBalance, TransactionQueryResult, LpPositionEnriched } from '../types';
import type { TokenSearchResult } from '../hooks/useTokenSearch';

export function createDataAccess(deps: {
  searchPulseChainTokens: (term: string) => Promise<TokenSearchResult[]>;
  loadPulseChainLpPositions: (addresses: string[], tokenPrices: Record<string, number>) => Promise<LpPositionEnriched[]>;
  loadPulseChainBalances: (address: string) => Promise<TokenBalance[]>;
  resolvePrices: (tokenAddresses: string[], chain: Chain) => Promise<PriceQuote[]>;
}) {
  function assertPulseChain(chain: Chain) {
    if (chain !== 'pulsechain') throw new Error(`Phase 1 ${chain} support is not implemented`);
  }

  return {
    async searchTokens(term: string, chain: Chain) {
      assertPulseChain(chain);
      return deps.searchPulseChainTokens(term);
    },
    async getLPPositions(addresses: string[], chain: Chain, tokenPrices: Record<string, number>) {
      assertPulseChain(chain);
      return deps.loadPulseChainLpPositions(addresses, tokenPrices);
    },
    async getTokenBalances(address: string, chain: Chain) {
      assertPulseChain(chain);
      return deps.loadPulseChainBalances(address);
    },
    async getPrices(tokenAddresses: string[], chain: Chain) {
      return deps.resolvePrices(tokenAddresses, chain);
    },
    async getTransactions(_address: string, _chain: Chain, _startBlock?: number): Promise<TransactionQueryResult> {
      return { implemented: false, transactions: [] };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/dataAccess.ts src/test/data-access.test.ts
git commit -m "feat: add unified data access facade"
```

### Task 4: Migrate `useTokenSearch` To The Service Layer

**Files:**
- Modify: `src/hooks/useTokenSearch.ts`
- Test: `src/test/data-access.test.ts`

- [ ] **Step 1: Write the failing hook-facing integration test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDataAccess } from '../services/dataAccess';

describe('token search integration contract', () => {
  it('returns search results through the unified facade without changing result shape', async () => {
    const facade = createDataAccess({
      searchPulseChainTokens: vi.fn(async () => [
        {
          id: 'v1:0x1',
          pairAddress: '0x1',
          token0: { id: 'a', symbol: 'AAA', name: 'AAA', decimals: '18' },
          token1: { id: 'b', symbol: 'WPLS', name: 'Wrapped Pulse', decimals: '18' },
          reserveUSD: '200',
          version: 'v1',
        },
      ]),
      loadPulseChainLpPositions: vi.fn(async () => []),
      loadPulseChainBalances: vi.fn(async () => []),
      resolvePrices: vi.fn(async () => []),
    });

    const results = await facade.searchTokens('aaa', 'pulsechain');

    expect(results[0].pairAddress).toBe('0x1');
    expect(results[0].version).toBe('v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: FAIL until the hook dependencies are wired to the facade contract.

- [ ] **Step 3: Refactor the hook to call the service**

```ts
// inside src/hooks/useTokenSearch.ts
import { dataAccess } from '../services/dataAccess';

// inside the debounced effect body
const combined = await dataAccess.searchTokens(trimmed, 'pulsechain');
setData(combined);
setIsError(false);
```

Implementation notes:

- Keep the hook's debounce behavior.
- Keep the existing `UseTokenSearchResult` return shape.
- Remove direct subgraph URL constants and fetch helpers from the hook after the service path is in place.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTokenSearch.ts src/test/data-access.test.ts
git commit -m "refactor: move token search to data access layer"
```

### Task 5: Migrate `useLiquidityPositions` To The Service Layer

**Files:**
- Modify: `src/hooks/useLiquidityPositions.ts`
- Modify: `src/services/adapters/pulsechainAdapter.ts`
- Test: `src/test/data-access.test.ts`

- [ ] **Step 1: Write the failing LP integration test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDataAccess } from '../services/dataAccess';

describe('lp positions integration contract', () => {
  it('preserves the enriched lp position shape expected by consumers', async () => {
    const facade = createDataAccess({
      searchPulseChainTokens: vi.fn(async () => []),
      loadPulseChainLpPositions: vi.fn(async () => [
        {
          pairAddress: '0xpair',
          pairName: 'PLSX / WPLS',
          token0Address: '0xplsx',
          token1Address: '0xwpls',
          token0Symbol: 'PLSX',
          token1Symbol: 'WPLS',
          token0Decimals: 18,
          token1Decimals: 18,
          token0Amount: 1,
          token1Amount: 2,
          token0Usd: 1,
          token1Usd: 2,
          totalUsd: 3,
          lpBalance: 0.5,
          totalSupply: 10,
          ownershipPct: 5,
          reserve0: 20,
          reserve1: 40,
          token0PriceUsd: 1,
          token1PriceUsd: 1,
          ilEstimate: null,
          fees24hUsd: null,
          volume24hUsd: null,
          isStaked: false,
          walletLpBalance: 0.5,
          stakedLpBalance: 0,
          sparkline: [],
        },
      ]),
      loadPulseChainBalances: vi.fn(async () => []),
      resolvePrices: vi.fn(async () => []),
    });

    const positions = await facade.getLPPositions(['0xwallet'], 'pulsechain', {});

    expect(positions[0].pairName).toBe('PLSX / WPLS');
    expect(positions[0].walletLpBalance).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: FAIL until LP loading is exposed through the facade.

- [ ] **Step 3: Refactor the hook and move the network logic into the adapter**

```ts
// inside src/hooks/useLiquidityPositions.ts
import { dataAccess } from '../services/dataAccess';

const nextPositions = await dataAccess.getLPPositions(walletAddresses, 'pulsechain', tokenPrices);
setPositions(nextPositions);
```

Implementation notes:

- Keep the hook's `positions`, `loading`, `error`, `refetch` API unchanged.
- Move `batchRPC`, fallback RPC handling, chunking, and PulseX subgraph enrichment into `pulsechainAdapter.ts`.
- Preserve current pair registry behavior in this phase instead of redesigning discovery.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLiquidityPositions.ts src/services/adapters/pulsechainAdapter.ts src/test/data-access.test.ts
git commit -m "refactor: move liquidity positions to data access layer"
```

### Task 6: Full Verification And Regression Check

**Files:**
- Modify: `src/test/data-access.test.ts` if needed to align with final signatures
- Verify: `src/test/build-investment-rows.test.ts`

- [ ] **Step 1: Run the focused service tests**

Run: `npm run test -- src/test/data-access.test.ts`
Expected: PASS

- [ ] **Step 2: Run the existing investment regression test**

Run: `npm run test -- src/test/build-investment-rows.test.ts`
Expected: PASS

- [ ] **Step 3: Run the typecheck**

Run: `npm run lint`
Expected: PASS with no TypeScript errors

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services src/hooks src/types.ts src/test/data-access.test.ts
git commit -m "feat: add phase 1 unified pulsechain data foundation"
```

## Self-Review

Spec coverage check:

- Unified data-access facade: covered by Task 3
- PulseChain adapter extraction: covered by Tasks 2 and 5
- Deterministic pricing: covered by Task 2
- Hook migration: covered by Tasks 4 and 5
- Minimal service-facing types: covered by Task 1
- Regression protection for current investment logic: covered by Task 6

Placeholder scan:

- No `TBD`, `TODO`, or deferred implementation markers remain inside task steps.

Type consistency check:

- `PriceQuote`, `TokenBalance`, and `TransactionQueryResult` are introduced before later tasks use them.
- `createDataAccess` and `resolveTokenPrices` names are consistent across tasks.
