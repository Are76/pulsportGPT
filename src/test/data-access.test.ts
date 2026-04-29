import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiquidityPositions } from '../hooks/useLiquidityPositions';
import { useTokenSearch } from '../hooks/useTokenSearch';
import { createTtlCache } from '../services/cache';
import {
  normalizePulsechainTokenSearchResults,
  type PulsechainTokenSearchResult,
} from '../services/adapters/pulsechainAdapter';
import { createDataAccess, dataAccess } from '../services/dataAccess';
import { resolvePriceQuotes } from '../services/priceService';
import type { LpPositionEnriched } from '../types';

const tempDir = join(process.cwd(), 'src', 'test', '.tmp-data-access');
const tempFile = join(tempDir, 'type-check.ts');
const tsconfigPath = join(process.cwd(), 'tsconfig.json');
const TARGET_LP_PAIR = '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9';
const TARGET_LP_WALLET = '0x00000000000000000000000000000000000000aa';

function encodeUint256(value: bigint | number): string {
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

function encodeReserves(reserve0: bigint | number, reserve1: bigint | number): string {
  return `0x${BigInt(reserve0).toString(16).padStart(64, '0')}${BigInt(reserve1).toString(16).padStart(64, '0')}${'0'.repeat(64)}`;
}

function getTypeDiagnostics() {
  mkdirSync(tempDir, { recursive: true });

  writeFileSync(
    tempFile,
    [
      "import type { Chain, LpPositionEnriched, PriceQuote, TokenBalance, Transaction, TransactionQueryResult } from '../../types';",
      "import type { PulsechainTokenSearchResult } from '../../services/adapters/pulsechainAdapter';",
      '',
      'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;',
      'type Expect<T extends true> = T;',
      '',
      "type BalanceKeys = Expect<Equal<keyof TokenBalance, 'address' | 'symbol' | 'name' | 'decimals' | 'balance' | 'chain'>>;",
      "type BalanceAddress = Expect<Equal<TokenBalance['address'], string>>;",
      "type BalanceSymbol = Expect<Equal<TokenBalance['symbol'], string>>;",
      "type BalanceName = Expect<Equal<TokenBalance['name'], string>>;",
      "type BalanceDecimals = Expect<Equal<TokenBalance['decimals'], number>>;",
      "type BalanceAmount = Expect<Equal<TokenBalance['balance'], number>>;",
      "type BalanceChain = Expect<Equal<TokenBalance['chain'], Chain>>;",
      '',
      "type QuoteKeys = Expect<Equal<keyof PriceQuote, 'tokenAddress' | 'chain' | 'priceUsd' | 'source'>>;",
      "type QuoteTokenAddress = Expect<Equal<PriceQuote['tokenAddress'], string>>;",
      "type QuoteChain = Expect<Equal<PriceQuote['chain'], Chain>>;",
      "type QuotePriceUsd = Expect<Equal<PriceQuote['priceUsd'], number | null>>;",
      "type QuoteSource = Expect<Equal<PriceQuote['source'], 'pulsex' | 'coingecko' | 'unpriced'>>;",
      '',
      "type ResultKeys = Expect<Equal<keyof TransactionQueryResult, 'implemented' | 'transactions' | 'nextBlock'>>;",
      "type ResultImplemented = Expect<Equal<TransactionQueryResult['implemented'], boolean>>;",
      "type ResultTransactions = Expect<Equal<TransactionQueryResult['transactions'], Transaction[]>>;",
      "type ResultNextBlock = Expect<Equal<TransactionQueryResult['nextBlock'], number | undefined>>;",
      '',
      "import { createDataAccess } from '../../services/dataAccess';",
      '',
      'const dataAccess = createDataAccess({',
      '  searchPulsechainTokens: async () => [],',
      '  getPulsechainLPPositions: async () => [],',
      '  getPulsechainTokenBalances: async () => [],',
      '  getPulsechainPrices: async () => [],',
      '  getPulsechainTransactions: async () => ({ implemented: true, transactions: [], nextBlock: undefined }),',
      '});',
      '',
      "type DataAccessKeys = Expect<Equal<keyof typeof dataAccess, 'searchTokens' | 'getLPPositions' | 'getTokenBalances' | 'getPrices' | 'getTransactions'>>;",
      "type SearchTokensArgs = Expect<Equal<Parameters<typeof dataAccess.searchTokens>, [term: string, chain: Chain]>>;",
      "type GetLPPositionsArgs = Expect<Equal<Parameters<typeof dataAccess.getLPPositions>, [addresses: string[], chain: Chain, tokenPrices: Record<string, number>]>>;",
      "type TokenBalancesArgs = Expect<Equal<Parameters<typeof dataAccess.getTokenBalances>, [address: string, chain: Chain]>>;",
      "type PricesArgs = Expect<Equal<Parameters<typeof dataAccess.getPrices>, [tokenAddresses: string[], chain: Chain]>>;",
      "type TransactionsArgs = Expect<Equal<Parameters<typeof dataAccess.getTransactions>, [address: string, chain: Chain, startBlock?: number, apiKey?: string]>>;",
      "type SearchTokensResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.searchTokens>>, PulsechainTokenSearchResult[]>>;",
      "type GetLPPositionsResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.getLPPositions>>, LpPositionEnriched[]>>;",
      "type TokenBalancesResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.getTokenBalances>>, TokenBalance[]>>;",
      "type PricesResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.getPrices>>, PriceQuote[]>>;",
      "type TransactionsResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.getTransactions>>, TransactionQueryResult>>;",
      '',
    ].join('\n'),
    'utf8',
  );

  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  expect(config.error).toBeUndefined();

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd(), undefined, tsconfigPath);
  const program = ts.createProgram([tempFile], parsed.options);

  return ts.getPreEmitDiagnostics(program);
}

describe('data access foundation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('expires cached values after the ttl', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));

    const cache = createTtlCache<string>(1000);

    cache.set('token', 'cached');

    vi.advanceTimersByTime(999);

    expect(cache.get('token')).toBe('cached');

    vi.advanceTimersByTime(1);

    expect(cache.get('token')).toBeUndefined();
  });

  it('supports delete and clear operations', () => {
    const cache = createTtlCache<string>(1000);

    cache.set('first', 'a');
    cache.set('second', 'b');

    cache.delete('first');

    expect(cache.get('first')).toBeUndefined();
    expect(cache.get('second')).toBe('b');

    cache.clear();

    expect(cache.get('second')).toBeUndefined();
  });

  it('rejects invalid ttl values', () => {
    expect(() => createTtlCache<string>(Number.NaN)).toThrow(RangeError);
    expect(() => createTtlCache<string>(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => createTtlCache<string>(0)).toThrow(RangeError);
    expect(() => createTtlCache<string>(-1)).toThrow(RangeError);
  });

  it('matches the exact service-facing data shapes', { timeout: 15000 }, () => {
    const diagnostics = getTypeDiagnostics();

    expect(diagnostics, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    })).toHaveLength(0);
  });

  it('keeps the highest-liquidity duplicate for each pair address and sorts by reserveUSD descending', () => {
    expect(
      normalizePulsechainTokenSearchResults([
        {
          id: ' v2:0xbbb ',
          pairAddress: ' 0xBBB ',
          token0: {
            id: ' 0xTokenB ',
            symbol: ' zen ',
            name: ' Zebra ',
            decimals: '18',
          },
          token1: {
            id: ' 0xwpls ',
            symbol: ' wpls ',
            name: ' Wrapped Pulse ',
            decimals: '18',
          },
          reserveUSD: '125.5',
          version: 'v2',
        },
        {
          id: 'v1:0xaaa',
          pairAddress: '0xAAA',
          token0: {
            id: '0xTokenA',
            symbol: 'ALPHA',
            name: ' Alpha Token ',
            decimals: '18',
          },
          token1: {
            id: '0xwpls',
            symbol: 'WPLS',
            name: 'Wrapped Pulse',
            decimals: '18',
          },
          reserveUSD: '5000.25',
          version: 'v1',
        },
        {
          id: 'v2:0xAAA',
          pairAddress: '0xAAA',
          token0: {
            id: '0xTokenADupe',
            symbol: 'ALPHA-ALT',
            name: 'Alternate Alpha',
            decimals: '18',
          },
          token1: {
            id: '0xwpls',
            symbol: 'WPLS',
            name: 'Wrapped Pulse',
            decimals: '18',
          },
          reserveUSD: '999999',
          version: 'v2',
        },
      ]),
    ).toEqual([
      {
        id: 'v2:0xAAA',
        pairAddress: '0xaaa',
        token0: {
          id: '0xtokenadupe',
          symbol: 'ALPHA-ALT',
          name: 'Alternate Alpha',
          decimals: '18',
        },
        token1: {
          id: '0xwpls',
          symbol: 'WPLS',
          name: 'Wrapped Pulse',
          decimals: '18',
        },
        reserveUSD: '999999',
        version: 'v2',
      },
      {
        id: 'v2:0xbbb',
        pairAddress: '0xbbb',
        token0: {
          id: '0xtokenb',
          symbol: 'ZEN',
          name: 'Zebra',
          decimals: '18',
        },
        token1: {
          id: '0xwpls',
          symbol: 'WPLS',
          name: 'Wrapped Pulse',
          decimals: '18',
        },
        reserveUSD: '125.5',
        version: 'v2',
      },
    ]);
  });

  it('uses PulseX prices first, CoinGecko second, and marks unresolved tokens as unpriced', () => {
    expect(
      resolvePriceQuotes(
        [
          { tokenAddress: '0xAAA', chain: 'pulsechain' },
          { tokenAddress: '0xBBB', chain: 'pulsechain' },
          { tokenAddress: '0xCCC', chain: 'pulsechain' },
        ],
        {
          pulseX: {
            '0xaaa': 1.23,
          },
          coinGecko: {
            '0xbbb': 4.56,
          },
        },
      ),
    ).toEqual([
      {
        tokenAddress: '0xaaa',
        chain: 'pulsechain',
        priceUsd: 1.23,
        source: 'pulsex',
      },
      {
        tokenAddress: '0xbbb',
        chain: 'pulsechain',
        priceUsd: 4.56,
        source: 'coingecko',
      },
      {
        tokenAddress: '0xccc',
        chain: 'pulsechain',
        priceUsd: null,
        source: 'unpriced',
      },
    ]);
  });

  it('ignores PulseX prices for non-pulsechain requests', () => {
    expect(
      resolvePriceQuotes(
        [
          { tokenAddress: '0xAAA', chain: 'ethereum' },
          { tokenAddress: '0xBBB', chain: 'base' },
        ],
        {
          pulseX: {
            '0xaaa': 1.23,
            '0xbbb': 4.56,
          },
          coinGecko: {
            '0xaaa': 2.34,
          },
        },
      ),
    ).toEqual([
      {
        tokenAddress: '0xaaa',
        chain: 'ethereum',
        priceUsd: 2.34,
        source: 'coingecko',
      },
      {
        tokenAddress: '0xbbb',
        chain: 'base',
        priceUsd: null,
        source: 'unpriced',
      },
    ]);
  });

  it('falls through invalid quotes and only returns real positive prices', () => {
    expect(
      resolvePriceQuotes(
        [
          { tokenAddress: '0xAAA', chain: 'pulsechain' },
          { tokenAddress: '0xBBB', chain: 'pulsechain' },
          { tokenAddress: '0xCCC', chain: 'pulsechain' },
          { tokenAddress: '0xDDD', chain: 'pulsechain' },
          { tokenAddress: '0xEEE', chain: 'pulsechain' },
        ],
        {
          pulseX: {
            '0xaaa': Number.NaN,
            '0xbbb': Number.POSITIVE_INFINITY,
            '0xccc': 0,
            '0xddd': -2,
            '0xeee': 7.89,
          },
          coinGecko: {
            '0xaaa': 1.11,
            '0xbbb': 2.22,
            '0xccc': Number.NaN,
            '0xddd': 0,
          },
        },
      ),
    ).toEqual([
      {
        tokenAddress: '0xaaa',
        chain: 'pulsechain',
        priceUsd: 1.11,
        source: 'coingecko',
      },
      {
        tokenAddress: '0xbbb',
        chain: 'pulsechain',
        priceUsd: 2.22,
        source: 'coingecko',
      },
      {
        tokenAddress: '0xccc',
        chain: 'pulsechain',
        priceUsd: null,
        source: 'unpriced',
      },
      {
        tokenAddress: '0xddd',
        chain: 'pulsechain',
        priceUsd: null,
        source: 'unpriced',
      },
      {
        tokenAddress: '0xeee',
        chain: 'pulsechain',
        priceUsd: 7.89,
        source: 'pulsex',
      },
    ]);
  });

  it('throws for unsupported chains on token balances when adapters are not wired', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getPulsechainTransactions: async () => ({ implemented: true, transactions: [], nextBlock: undefined }),
    });

    await expect(dataAccess.getTokenBalances('0xwallet', 'ethereum')).rejects.toThrow(
      'Unsupported chain for Phase 1 data access: ethereum',
    );
  });

  it('throws for unsupported chains on token search in Phase 1', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getPulsechainTransactions: async () => ({ implemented: true, transactions: [], nextBlock: undefined }),
    });

    await expect(dataAccess.searchTokens('hex', 'ethereum')).rejects.toThrow(
      'Unsupported chain for Phase 1 data access: ethereum',
    );
  });

  it('delegates pulsechain requests through the injected dependencies', async () => {
    const searchPulsechainTokens = vi.fn(async (term: string): Promise<PulsechainTokenSearchResult[]> => [
      {
        id: `v1:${term}`,
        pairAddress: '0xpair',
        token0: {
          id: '0xtoken0',
          symbol: 'HEX',
          name: 'HEX',
          decimals: '8',
        },
        token1: {
          id: '0xtoken1',
          symbol: 'WPLS',
          name: 'Wrapped Pulse',
          decimals: '18',
        },
        reserveUSD: '100',
        version: 'v1',
      },
    ]);
    const getPulsechainLPPositions = vi.fn(async (addresses: string[], tokenPrices: Record<string, number>) => [
      {
        pairAddress: '0xpair',
        pairName: 'HEX/WPLS',
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Symbol: 'HEX',
        token1Symbol: 'WPLS',
        token0Decimals: 8,
        token1Decimals: 18,
        token0Amount: addresses.length,
        token1Amount: tokenPrices['0xtoken'] ?? 0,
        token0Usd: 1,
        token1Usd: 2,
        totalUsd: 3,
        lpBalance: 4,
        totalSupply: 10,
        ownershipPct: 40,
        reserve0: 1,
        reserve1: 1,
        token0PriceUsd: 1,
        token1PriceUsd: 2,
        ilEstimate: null,
        fees24hUsd: null,
        volume24hUsd: null,
        isStaked: false,
        walletLpBalance: 4,
        stakedLpBalance: 0,
        sparkline: [],
      },
    ]);
    const getPulsechainTokenBalances = vi.fn(async (address: string) => [
      {
        address: '0xtoken',
        symbol: 'PLS',
        name: 'Pulse',
        decimals: 18,
        balance: 1,
        chain: 'pulsechain' as const,
      },
    ]);
    const getEthereumTokenBalances = vi.fn(async (address: string) => [
      {
        address: 'native',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        balance: address === '0xwallet' ? 2 : 0,
        chain: 'ethereum' as const,
      },
    ]);
    const getBaseTokenBalances = vi.fn(async () => [
      {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        balance: 10,
        chain: 'base' as const,
      },
    ]);
    const getEthereumPrices = vi.fn(async (tokenAddresses: string[]) => tokenAddresses.map((tokenAddress) => ({
      tokenAddress,
      chain: 'ethereum' as const,
      priceUsd: 2,
      source: 'coingecko' as const,
    })));
    const getBasePrices = vi.fn(async (tokenAddresses: string[]) => tokenAddresses.map((tokenAddress) => ({
      tokenAddress,
      chain: 'base' as const,
      priceUsd: 1,
      source: 'coingecko' as const,
    })));
    const getPulsechainPrices = vi.fn(async (tokenAddresses: string[]) => [
      {
        tokenAddress: tokenAddresses[0],
        chain: 'pulsechain' as const,
        priceUsd: 1,
        source: 'pulsex' as const,
      },
    ]);
    const getPulsechainTransactions = vi.fn(async (_address: string, _startBlock?: number) => ({
      implemented: true,
      transactions: [],
      nextBlock: undefined,
    }));

    const dataAccess = createDataAccess({
      searchPulsechainTokens,
      getPulsechainLPPositions,
      getBasePrices,
      getBaseTokenBalances,
      getEthereumPrices,
      getEthereumTokenBalances,
      getPulsechainTokenBalances,
      getPulsechainPrices,
      getPulsechainTransactions,
    });

    await expect(dataAccess.searchTokens('hex', 'pulsechain')).resolves.toEqual([
      {
        id: 'v1:hex',
        pairAddress: '0xpair',
        token0: {
          id: '0xtoken0',
          symbol: 'HEX',
          name: 'HEX',
          decimals: '8',
        },
        token1: {
          id: '0xtoken1',
          symbol: 'WPLS',
          name: 'Wrapped Pulse',
          decimals: '18',
        },
        reserveUSD: '100',
        version: 'v1',
      },
    ]);
    await expect(dataAccess.getLPPositions(['0xwallet'], 'pulsechain', { '0xtoken': 1 })).resolves.toEqual([
      {
        pairAddress: '0xpair',
        pairName: 'HEX/WPLS',
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Symbol: 'HEX',
        token1Symbol: 'WPLS',
        token0Decimals: 8,
        token1Decimals: 18,
        token0Amount: 1,
        token1Amount: 1,
        token0Usd: 1,
        token1Usd: 2,
        totalUsd: 3,
        lpBalance: 4,
        totalSupply: 10,
        ownershipPct: 40,
        reserve0: 1,
        reserve1: 1,
        token0PriceUsd: 1,
        token1PriceUsd: 2,
        ilEstimate: null,
        fees24hUsd: null,
        volume24hUsd: null,
        isStaked: false,
        walletLpBalance: 4,
        stakedLpBalance: 0,
        sparkline: [],
      },
    ]);
    await expect(dataAccess.getTokenBalances('0xwallet', 'pulsechain')).resolves.toHaveLength(1);
    await expect(dataAccess.getTokenBalances('0xwallet', 'ethereum')).resolves.toEqual([
      {
        address: 'native',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        balance: 2,
        chain: 'ethereum',
      },
    ]);
    await expect(dataAccess.getTokenBalances('0xwallet', 'base')).resolves.toEqual([
      {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        balance: 10,
        chain: 'base',
      },
    ]);
    await expect(dataAccess.getPrices(['0xtoken'], 'pulsechain')).resolves.toEqual([
      {
        tokenAddress: '0xtoken',
        chain: 'pulsechain',
        priceUsd: 1,
        source: 'pulsex',
      },
    ]);
    await expect(dataAccess.getPrices(['native'], 'ethereum')).resolves.toEqual([
      {
        tokenAddress: 'native',
        chain: 'ethereum',
        priceUsd: 2,
        source: 'coingecko',
      },
    ]);
    await expect(dataAccess.getPrices(['native'], 'base')).resolves.toEqual([
      {
        tokenAddress: 'native',
        chain: 'base',
        priceUsd: 1,
        source: 'coingecko',
      },
    ]);

    expect(searchPulsechainTokens).toHaveBeenCalledWith('hex');
    expect(getPulsechainLPPositions).toHaveBeenCalledWith(['0xwallet'], { '0xtoken': 1 });
    expect(getPulsechainTokenBalances).toHaveBeenCalledWith('0xwallet');
    expect(getEthereumTokenBalances).toHaveBeenCalledWith('0xwallet');
    expect(getBaseTokenBalances).toHaveBeenCalledWith('0xwallet');
    expect(getPulsechainPrices).toHaveBeenCalledWith(['0xtoken']);
    expect(getEthereumPrices).toHaveBeenCalledWith(['native']);
    expect(getBasePrices).toHaveBeenCalledWith(['native']);
    await expect(dataAccess.getTransactions('0xwallet', 'pulsechain', 123)).resolves.toEqual({
      implemented: true,
      transactions: [],
      nextBlock: undefined,
    });
    expect(getPulsechainTransactions).toHaveBeenCalledWith('0xwallet', 123);
  });

  it('provides a runtime pulsechain token search implementation through the default data access instance', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            pairs: [
              {
                id: '0xPAIR',
                token0: {
                  id: ' 0xToken ',
                  symbol: ' hex ',
                  name: ' HEX ',
                  decimals: '8',
                },
                token1: {
                  id: ' 0xa1077a294dde1b09bb078844df40758a5d0f9a27 ',
                  symbol: ' wpls ',
                  name: ' Wrapped Pulse ',
                  decimals: '18',
                },
                reserve0: '1',
                reserve1: '12000000',
                reserveUSD: '200',
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            pairs: [
              {
                id: '0xpair',
                token0: {
                  id: '0xTokenDup',
                  symbol: 'HEX2',
                  name: 'Hex Dup',
                  decimals: '8',
                },
                token1: {
                  id: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
                  symbol: 'WPLS',
                  name: 'Wrapped Pulse',
                  decimals: '18',
                },
                reserve0: '1',
                reserve1: '15000000',
                reserveUSD: '999',
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    await expect(dataAccess.searchTokens('hex', 'pulsechain')).resolves.toEqual([
      {
        id: 'v2:0xpair',
        pairAddress: '0xpair',
        token0: {
          id: '0xtokendup',
          symbol: 'HEX2',
          name: 'Hex Dup',
          decimals: '8',
        },
        token1: {
          id: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
          symbol: 'WPLS',
          name: 'Wrapped Pulse',
          decimals: '18',
        },
        reserveUSD: '999',
        version: 'v2',
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('provides a typed runtime pulsechain LP implementation through the default data access instance', async () => {
    let primaryRpcAttempts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === 'https://rpc-pulsechain.g4mm4.io') {
        primaryRpcAttempts += 1;

        if (primaryRpcAttempts === 1) {
          throw new Error('primary rpc unavailable');
        }
      }

      if (url === 'https://rpc-pulsechain.g4mm4.io' || url === 'https://rpc.pulsechain.com') {
        const body = JSON.parse(String(init?.body)) as Array<{
          id: number;
          params: [{ to: string; data: string }, string];
        }>;

        return {
          json: async () => body.map(({ id, params: [{ to, data }] }) => {
            const normalizedTo = to.toLowerCase();
            const normalizedData = data.toLowerCase();

            if (normalizedTo === TARGET_LP_PAIR && normalizedData === '0x0902f1ac') {
              return { id, result: encodeReserves(1000n * 10n ** 18n, 2000n * 10n ** 18n) };
            }

            if (normalizedTo === TARGET_LP_PAIR && normalizedData === '0x18160ddd') {
              return { id, result: encodeUint256(10n * 10n ** 18n) };
            }

            if (normalizedTo === TARGET_LP_PAIR && normalizedData.startsWith('0x70a08231')) {
              return { id, result: encodeUint256(10n ** 18n) };
            }

            if (normalizedTo === '0xb2ca4a66d3e57a5a9a12043b6bad28249fe302d4' && normalizedData === '0x081e3eda') {
              return { id, result: encodeUint256(0) };
            }

            return { id, result: '0x' };
          }),
        };
      }

      if (url === 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex') {
        return {
          ok: true,
          json: async () => ({
            data: {
              pairDayDatas: [
                {
                  pairAddress: TARGET_LP_PAIR,
                  dailyVolumeUSD: '1000',
                },
              ],
            },
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const positions = await dataAccess.getLPPositions(
      [TARGET_LP_WALLET],
      'pulsechain',
      { PLSX: 0.5, WPLS: 0.01, INC: 2 },
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      pairAddress: TARGET_LP_PAIR,
      pairName: 'PLSX/WPLS',
      token0Amount: 100,
      token1Amount: 200,
      totalUsd: 52,
      volume24hUsd: 1000,
      isStaked: false,
      walletLpBalance: 1,
      stakedLpBalance: 0,
    });
    expect(positions[0].fees24hUsd).toBeCloseTo(0.3);
    expect(positions[0].sparkline).toHaveLength(7);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === 'https://rpc.pulsechain.com')).toBe(true);
  });

  it('provides a live runtime pulsechain token balance implementation through the default data access instance', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Array<{
        id: number;
        method: string;
        params: Array<{ to: string; data: string } | string>;
      }>;

      return {
        json: async () => body.map(({ id, method, params }) => {
          if (method === 'eth_getBalance') {
            return { id, result: encodeUint256(2n * 10n ** 18n) };
          }

          const call = params[0] as { to: string; data: string };
          const tokenAddress = call.to.toLowerCase();

          if (tokenAddress === '0xa1077a294dde1b09bb078844df40758a5d0f9a27') {
            return { id, result: encodeUint256(5n * 10n ** 17n) };
          }

          return { id, result: encodeUint256(0) };
        }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(dataAccess.getTokenBalances(TARGET_LP_WALLET, 'pulsechain')).resolves.toEqual([
      {
        address: 'native',
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: 18,
        balance: 2,
        chain: 'pulsechain',
      },
      {
        address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
        symbol: 'WPLS',
        name: 'WPLS',
        decimals: 18,
        balance: 0.5,
        chain: 'pulsechain',
      },
    ]);
  });

  it('provides a live runtime pulsechain price implementation through the default data access instance', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.startsWith('https://api.coingecko.com/api/v3/simple/price')) {
        return {
          ok: true,
          json: async () => ({
            'wrapped-bitcoin': {
              usd: 12345,
            },
          }),
        };
      }

      const body = JSON.parse(String(init?.body)) as Array<{
        id: number;
        params: [{ to: string; data: string }, string];
      }>;

      return {
        json: async () => body.map(({ id, params: [{ to, data }] }) => {
          const normalizedTo = to.toLowerCase();
          const normalizedData = data.toLowerCase();

          if (normalizedData !== '0x0902f1ac') {
            return { id, result: '0x' };
          }

          if (normalizedTo === '0x6753560538eca67617a9ce605178f788be7e524e') {
            return { id, result: encodeReserves(100n * 10n ** 6n, 1000n * 10n ** 18n) };
          }

          if (normalizedTo === '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9') {
            return { id, result: encodeReserves(500n * 10n ** 18n, 100n * 10n ** 18n) };
          }

          return { id, result: encodeReserves(0n, 0n) };
        }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);

    const prices = await dataAccess.getPrices(
      [
        '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
        '0xb17d901469b9208b17d916112988a3fed19b5ca1',
      ],
      'pulsechain',
    );

    expect(prices).toHaveLength(2);
    expect(prices[0]).toMatchObject({
      tokenAddress: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
      chain: 'pulsechain',
      source: 'pulsex',
    });
    expect(prices[0].priceUsd).toBeCloseTo(0.02);
    expect(prices[1]).toEqual({
      tokenAddress: '0xb17d901469b9208b17d916112988a3fed19b5ca1',
      chain: 'pulsechain',
      priceUsd: 12345,
      source: 'coingecko',
    });
  });

  it('provides live runtime Ethereum and Base balance implementations through the default data access instance', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      const rpcUrl = url;
      const body = JSON.parse(String(init?.body ?? '[]')) as Array<{ id: number; method: string; params: unknown[] }>;

      if (rpcUrl.includes('ethereum-rpc.publicnode.com')) {
        return {
          ok: true,
          json: async () => body.map((request) => {
            if (request.method === 'eth_getBalance') {
              return { id: request.id, result: encodeUint256(1n * 10n ** 18n) };
            }

            const call = request.params[0] as { to: string };
            const tokenAddress = call.to.toLowerCase();
            if (tokenAddress === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') {
              return { id: request.id, result: encodeUint256(25n * 10n ** 6n) };
            }
            return { id: request.id, result: encodeUint256(0n) };
          }),
        };
      }

      if (rpcUrl.includes('mainnet.base.org')) {
        return {
          ok: true,
          json: async () => body.map((request) => {
            if (request.method === 'eth_getBalance') {
              return { id: request.id, result: encodeUint256(2n * 10n ** 18n) };
            }

            const call = request.params[0] as { to: string };
            const tokenAddress = call.to.toLowerCase();
            if (tokenAddress === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
              return { id: request.id, result: encodeUint256(50n * 10n ** 6n) };
            }
            return { id: request.id, result: encodeUint256(0n) };
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(dataAccess.getTokenBalances(TARGET_LP_WALLET, 'ethereum')).resolves.toEqual([
      {
        address: 'native',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        balance: 1,
        chain: 'ethereum',
      },
      {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        balance: 25,
        chain: 'ethereum',
      },
    ]);

    await expect(dataAccess.getTokenBalances(TARGET_LP_WALLET, 'base')).resolves.toEqual([
      {
        address: 'native',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        balance: 2,
        chain: 'base',
      },
      {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        balance: 50,
        chain: 'base',
      },
    ]);
  });

  it('does not load liquidity positions on mount until refetch is called', async () => {
    const position = {
      pairAddress: TARGET_LP_PAIR,
      pairName: 'PLSX/WPLS',
      token0Address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
      token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      token0Symbol: 'PLSX',
      token1Symbol: 'WPLS',
      token0Decimals: 18,
      token1Decimals: 18,
      token0Amount: 100,
      token1Amount: 200,
      token0Usd: 50,
      token1Usd: 2,
      totalUsd: 52,
      lpBalance: 1,
      totalSupply: 10,
      ownershipPct: 10,
      reserve0: 1000,
      reserve1: 2000,
      token0PriceUsd: 0.5,
      token1PriceUsd: 0.01,
      ilEstimate: null,
      fees24hUsd: 0.3,
      volume24hUsd: 1000,
      isStaked: false,
      walletLpBalance: 1,
      stakedLpBalance: 0,
      sparkline: [{ t: 1, v: 52 }],
    };
    const getLPPositionsSpy = vi.spyOn(dataAccess, 'getLPPositions').mockResolvedValue([position]);
    const fetchMock = vi.fn(() => {
      throw new Error('hook should use data access instead of fetch');
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLiquidityPositions([TARGET_LP_WALLET], { PLSX: 0.5, WPLS: 0.01, INC: 2 }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getLPPositionsSpy).not.toHaveBeenCalled();
    expect(result.current.positions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refetch).toBe('function');

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([position]);
    });

    expect(getLPPositionsSpy).toHaveBeenCalledWith(
      [TARGET_LP_WALLET],
      'pulsechain',
      { PLSX: 0.5, WPLS: 0.01, INC: 2 },
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not reload liquidity positions when hook dependencies change until refetch is called', async () => {
    const initialPosition = {
      pairAddress: TARGET_LP_PAIR,
      pairName: 'PLSX/WPLS',
      token0Address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
      token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      token0Symbol: 'PLSX',
      token1Symbol: 'WPLS',
      token0Decimals: 18,
      token1Decimals: 18,
      token0Amount: 100,
      token1Amount: 200,
      token0Usd: 50,
      token1Usd: 2,
      totalUsd: 52,
      lpBalance: 1,
      totalSupply: 10,
      ownershipPct: 10,
      reserve0: 1000,
      reserve1: 2000,
      token0PriceUsd: 0.5,
      token1PriceUsd: 0.01,
      ilEstimate: null,
      fees24hUsd: 0.3,
      volume24hUsd: 1000,
      isStaked: false,
      walletLpBalance: 1,
      stakedLpBalance: 0,
      sparkline: [{ t: 1, v: 52 }],
    };
    const updatedPosition = {
      ...initialPosition,
      token0Usd: 60,
      totalUsd: 62,
      token0PriceUsd: 0.6,
      sparkline: [{ t: 2, v: 62 }],
    };
    const getLPPositionsSpy = vi.spyOn(dataAccess, 'getLPPositions')
      .mockResolvedValueOnce([initialPosition])
      .mockResolvedValueOnce([updatedPosition]);

    const { result, rerender } = renderHook(
      ({ wallets, prices }) => useLiquidityPositions(wallets, prices),
      {
        initialProps: {
          wallets: [TARGET_LP_WALLET],
          prices: { PLSX: 0.5, WPLS: 0.01, INC: 2 },
        },
      },
    );

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([initialPosition]);
    });

    await act(async () => {
      rerender({
        wallets: [TARGET_LP_WALLET],
        prices: { PLSX: 0.6, WPLS: 0.01, INC: 2 },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getLPPositionsSpy).toHaveBeenCalledTimes(1);
    expect(result.current.positions).toEqual([initialPosition]);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([updatedPosition]);
    });

    expect(getLPPositionsSpy).toHaveBeenNthCalledWith(
      1,
      [TARGET_LP_WALLET],
      'pulsechain',
      { PLSX: 0.5, WPLS: 0.01, INC: 2 },
    );
    expect(getLPPositionsSpy).toHaveBeenNthCalledWith(
      2,
      [TARGET_LP_WALLET],
      'pulsechain',
      { PLSX: 0.6, WPLS: 0.01, INC: 2 },
    );
  });

  it('clears stale positions and loading when wallets become empty', async () => {
    let resolvePositions: ((positions: LpPositionEnriched[]) => void) | null = null;
    const position = {
      pairAddress: TARGET_LP_PAIR,
      pairName: 'PLSX/WPLS',
      token0Address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
      token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      token0Symbol: 'PLSX',
      token1Symbol: 'WPLS',
      token0Decimals: 18,
      token1Decimals: 18,
      token0Amount: 100,
      token1Amount: 200,
      token0Usd: 50,
      token1Usd: 2,
      totalUsd: 52,
      lpBalance: 1,
      totalSupply: 10,
      ownershipPct: 10,
      reserve0: 1000,
      reserve1: 2000,
      token0PriceUsd: 0.5,
      token1PriceUsd: 0.01,
      ilEstimate: null,
      fees24hUsd: 0.3,
      volume24hUsd: 1000,
      isStaked: false,
      walletLpBalance: 1,
      stakedLpBalance: 0,
      sparkline: [{ t: 1, v: 52 }],
    };
    const getLPPositionsSpy = vi.spyOn(dataAccess, 'getLPPositions')
      .mockResolvedValueOnce([position])
      .mockImplementationOnce(() => new Promise<LpPositionEnriched[]>(resolve => {
        resolvePositions = resolve;
      }));

    const { result, rerender } = renderHook(
      ({ wallets }) => useLiquidityPositions(wallets, { PLSX: 0.5, WPLS: 0.01, INC: 2 }),
      {
        initialProps: {
          wallets: [TARGET_LP_WALLET],
        },
      },
    );

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([position]);
    });

    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      rerender({ wallets: [] });
    });

    expect(result.current.positions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getLPPositionsSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePositions?.([position]);
      await Promise.resolve();
    });
  });

  it('clears stale errors when wallets become empty', async () => {
    const getLPPositionsSpy = vi.spyOn(dataAccess, 'getLPPositions')
      .mockRejectedValueOnce(new Error('boom'));

    const { result, rerender } = renderHook(
      ({ wallets }) => useLiquidityPositions(wallets, { PLSX: 0.5, WPLS: 0.01, INC: 2 }),
      {
        initialProps: {
          wallets: [TARGET_LP_WALLET],
        },
      },
    );

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('boom');
    });

    await act(async () => {
      rerender({ wallets: [] });
    });

    expect(result.current.positions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getLPPositionsSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks stale non-empty responses after hook dependencies change before the request settles', async () => {
    let resolveInitial: ((positions: LpPositionEnriched[]) => void) | null = null;
    const initialPosition = {
      pairAddress: TARGET_LP_PAIR,
      pairName: 'PLSX/WPLS',
      token0Address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
      token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      token0Symbol: 'PLSX',
      token1Symbol: 'WPLS',
      token0Decimals: 18,
      token1Decimals: 18,
      token0Amount: 100,
      token1Amount: 200,
      token0Usd: 50,
      token1Usd: 2,
      totalUsd: 52,
      lpBalance: 1,
      totalSupply: 10,
      ownershipPct: 10,
      reserve0: 1000,
      reserve1: 2000,
      token0PriceUsd: 0.5,
      token1PriceUsd: 0.01,
      ilEstimate: null,
      fees24hUsd: 0.3,
      volume24hUsd: 1000,
      isStaked: false,
      walletLpBalance: 1,
      stakedLpBalance: 0,
      sparkline: [{ t: 1, v: 52 }],
    };
    const updatedPosition = {
      ...initialPosition,
      token0Usd: 60,
      totalUsd: 62,
      token0PriceUsd: 0.6,
      sparkline: [{ t: 2, v: 62 }],
    };
    const getLPPositionsSpy = vi.spyOn(dataAccess, 'getLPPositions')
      .mockImplementationOnce(() => new Promise<LpPositionEnriched[]>(resolve => {
        resolveInitial = resolve;
      }))
      .mockResolvedValueOnce([updatedPosition]);

    const { result, rerender } = renderHook(
      ({ wallets, prices }) => useLiquidityPositions(wallets, prices),
      {
        initialProps: {
          wallets: [TARGET_LP_WALLET],
          prices: { PLSX: 0.5, WPLS: 0.01, INC: 2 },
        },
      },
    );

    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      rerender({
        wallets: [TARGET_LP_WALLET],
        prices: { PLSX: 0.6, WPLS: 0.01, INC: 2 },
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.positions).toEqual([]);

    await act(async () => {
      resolveInitial?.([initialPosition]);
      await Promise.resolve();
    });

    expect(result.current.positions).toEqual([]);
    expect(result.current.error).toBeNull();

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([updatedPosition]);
    });

    expect(getLPPositionsSpy).toHaveBeenNthCalledWith(
      1,
      [TARGET_LP_WALLET],
      'pulsechain',
      { PLSX: 0.5, WPLS: 0.01, INC: 2 },
    );
    expect(getLPPositionsSpy).toHaveBeenNthCalledWith(
      2,
      [TARGET_LP_WALLET],
      'pulsechain',
      { PLSX: 0.6, WPLS: 0.01, INC: 2 },
    );
  });

  it('treats a partial subgraph failure with an empty successful result as a valid no-results response', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('v1 failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            pairs: [],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    await expect(dataAccess.searchTokens('hex', 'pulsechain')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the superseded token search before starting the next debounced search', async () => {
    vi.useFakeTimers();

    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);

      if (signals.length <= 2) {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            pairs: [],
          },
        }),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ term }) => useTokenSearch(term), {
      initialProps: { term: 'he' },
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(false);

    await act(async () => {
      rerender({ term: 'hex' });
      await Promise.resolve();
    });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.noResults).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('does not let one hook instance cancel another hook instance search', async () => {
    vi.useFakeTimers();

    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);

      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const abortError = new Error('Aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useTokenSearch('he'));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    renderHook(() => useTokenSearch('hex'));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(false);
  });

  it('throws for unsupported chains on LP positions in Phase 1', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getPulsechainTransactions: async () => ({ implemented: true, transactions: [], nextBlock: undefined }),
    });

    await expect(dataAccess.getLPPositions(['0xwallet'], 'base', { '0xtoken': 1 })).rejects.toThrow(
      'Unsupported chain for Phase 1 data access: base',
    );
  });

  it('throws for unsupported chains on prices when adapters are not wired', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getPulsechainTransactions: async () => ({ implemented: true, transactions: [], nextBlock: undefined }),
    });

    await expect(dataAccess.getPrices(['0xtoken'], 'base')).rejects.toThrow('Unsupported chain for Phase 1 data access: base');
  });

  it('returns the injected transaction query result shape', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getPulsechainTransactions: async () => ({
        implemented: true,
        transactions: [],
        nextBlock: 321,
      }),
    });

    await expect(dataAccess.getTransactions('0xwallet', 'pulsechain')).resolves.toEqual({
      implemented: true,
      transactions: [],
      nextBlock: 321,
    });
  });

  it('throws for unsupported chains on transactions when adapters are not wired', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getPulsechainTransactions: async () => ({ implemented: true, transactions: [], nextBlock: undefined }),
    });

    await expect(dataAccess.getTransactions('0xwallet', 'ethereum')).rejects.toThrow(
      'Unsupported chain for Phase 1 data access: ethereum',
    );
  });
});
