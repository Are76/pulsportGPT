import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '../services/cache';
import {
  normalizePulsechainTokenSearchResults,
  type PulsechainTokenSearchResult,
} from '../services/adapters/pulsechainAdapter';
import { createDataAccess } from '../services/dataAccess';
import { resolvePriceQuotes } from '../services/priceService';

const tempDir = join(process.cwd(), 'src', 'test', '.tmp-data-access');
const tempFile = join(tempDir, 'type-check.ts');
const tsconfigPath = join(process.cwd(), 'tsconfig.json');

function getTypeDiagnostics() {
  mkdirSync(tempDir, { recursive: true });

  writeFileSync(
    tempFile,
    [
      "import type { Chain, PriceQuote, TokenBalance, Transaction, TransactionQueryResult } from '../../types';",
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
      '});',
      '',
      "type DataAccessKeys = Expect<Equal<keyof typeof dataAccess, 'searchTokens' | 'getLPPositions' | 'getTokenBalances' | 'getPrices' | 'getTransactions'>>;",
      "type SearchTokensArgs = Expect<Equal<Parameters<typeof dataAccess.searchTokens>, [term: string, chain: Chain]>>;",
      "type GetLPPositionsArgs = Expect<Equal<Parameters<typeof dataAccess.getLPPositions>, [addresses: string[], chain: Chain, tokenPrices: Record<string, number>]>>;",
      "type TokenBalancesArgs = Expect<Equal<Parameters<typeof dataAccess.getTokenBalances>, [address: string, chain: Chain]>>;",
      "type PricesArgs = Expect<Equal<Parameters<typeof dataAccess.getPrices>, [tokenAddresses: string[], chain: Chain]>>;",
      "type TransactionsArgs = Expect<Equal<Parameters<typeof dataAccess.getTransactions>, [address: string, chain: Chain, startBlock?: number]>>;",
      "type SearchTokensResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.searchTokens>>, PulsechainTokenSearchResult[]>>;",
      "type GetLPPositionsResult = Expect<Equal<Awaited<ReturnType<typeof dataAccess.getLPPositions>>, import('../../types').LpPosition[]>>;",
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

  it('matches the exact service-facing data shapes', () => {
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

  it('throws for unsupported chains on token balances in Phase 1', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
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
    const getPulsechainPrices = vi.fn(async (tokenAddresses: string[]) => [
      {
        tokenAddress: tokenAddresses[0],
        chain: 'pulsechain' as const,
        priceUsd: 1,
        source: 'pulsex' as const,
      },
    ]);

    const dataAccess = createDataAccess({
      searchPulsechainTokens,
      getPulsechainLPPositions,
      getPulsechainTokenBalances,
      getPulsechainPrices,
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
      },
    ]);
    await expect(dataAccess.getTokenBalances('0xwallet', 'pulsechain')).resolves.toHaveLength(1);
    await expect(dataAccess.getPrices(['0xtoken'], 'pulsechain')).resolves.toEqual([
      {
        tokenAddress: '0xtoken',
        chain: 'pulsechain',
        priceUsd: 1,
        source: 'pulsex',
      },
    ]);

    expect(searchPulsechainTokens).toHaveBeenCalledWith('hex');
    expect(getPulsechainLPPositions).toHaveBeenCalledWith(['0xwallet'], { '0xtoken': 1 });
    expect(getPulsechainTokenBalances).toHaveBeenCalledWith('0xwallet');
    expect(getPulsechainPrices).toHaveBeenCalledWith(['0xtoken']);
  });

  it('throws for unsupported chains on LP positions in Phase 1', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
    });

    await expect(dataAccess.getLPPositions(['0xwallet'], 'base', { '0xtoken': 1 })).rejects.toThrow(
      'Unsupported chain for Phase 1 data access: base',
    );
  });

  it('throws for unsupported chains on prices in Phase 1', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
    });

    await expect(dataAccess.getPrices(['0xtoken'], 'base')).rejects.toThrow('Unsupported chain for Phase 1 data access: base');
  });

  it('returns a typed Phase 1 placeholder for transactions', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
    });

    await expect(dataAccess.getTransactions('0xwallet', 'pulsechain')).resolves.toEqual({
      implemented: false,
      transactions: [],
      nextBlock: undefined,
    });
  });

  it('throws for unsupported chains on transactions in Phase 1', async () => {
    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
    });

    await expect(dataAccess.getTransactions('0xwallet', 'ethereum')).rejects.toThrow(
      'Unsupported chain for Phase 1 data access: ethereum',
    );
  });
});
