import { formatUnits } from 'viem';
import { PULSEX_LP_PAIRS, TOKENS } from '../../constants';
import type { LpPositionEnriched, PriceQuote, TokenBalance } from '../../types';
import { resolvePriceQuotes } from '../priceService';
import {
  batchRpcCall,
  FETCH_TIMEOUT,
  padAddress,
  parseBigIntResult,
  type RpcBatchRequest,
  type RpcBatchResponse,
} from './rpcUtils';

export interface PulsechainTokenSearchResult {
  id: string;
  pairAddress: string;
  token0: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };
  token1: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };
  reserveUSD: string;
  version: 'v1' | 'v2';
}

const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
const MIN_WPLS_RESERVE = 10_000_000;
const PRIMARY_RPC = 'https://rpc-pulsechain.g4mm4.io';
const FALLBACK_RPC = 'https://rpc.pulsechain.com';
const MASTERCHEF = '0xb2ca4a66d3e57a5a9a12043b6bad28249fe302d4';
const POOL_CAP = 200;
const CHUNK_SIZE = 50;

const SUBGRAPH_URLS = {
  v1: 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex',
  v2: 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex-v2',
} as const;

export const PULSEX_PAIR_REGISTRY: Record<string, {
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  token0Address: string;
  token1Address: string;
}> = {
  '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9': {
    token0Symbol: 'PLSX', token1Symbol: 'WPLS',
    token0Decimals: 18, token1Decimals: 18,
    token0Address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
    token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  },
  '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa': {
    token0Symbol: 'INC', token1Symbol: 'WPLS',
    token0Decimals: 18, token1Decimals: 18,
    token0Address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d',
    token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  },
  '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65': {
    token0Symbol: 'pHEX', token1Symbol: 'WPLS',
    token0Decimals: 8, token1Decimals: 18,
    token0Address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
    token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  },
  '0x42abdfdb63f3282033c766e72cc4810738571609': {
    token0Symbol: 'pWETH', token1Symbol: 'WPLS',
    token0Decimals: 18, token1Decimals: 18,
    token0Address: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c',
    token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  },
  '0xdb82b0919584124a0eb176ab136a0cc9f148b2d1': {
    token0Symbol: 'WPLS', token1Symbol: 'pWBTC',
    token0Decimals: 18, token1Decimals: 8,
    token0Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
    token1Address: '0xb17d901469b9208b17d916112988a3fed19b5ca1',
  },
  '0xe56043671df55de5cdf8459710433c10324de0ae': {
    token0Symbol: 'WPLS', token1Symbol: 'pDAI',
    token0Decimals: 18, token1Decimals: 18,
    token0Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
    token1Address: '0xefd766ccb38eaf1dfd701853bfce31359239f305',
  },
  '0x6753560538eca67617a9ce605178f788be7e524e': {
    token0Symbol: 'pUSDC', token1Symbol: 'WPLS',
    token0Decimals: 6, token1Decimals: 18,
    token0Address: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07',
    token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  },
  '0x322df7921f28f1146cdf62afdac0d6bc0ab80711': {
    token0Symbol: 'pUSDT', token1Symbol: 'WPLS',
    token0Decimals: 6, token1Decimals: 18,
    token0Address: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f',
    token1Address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
  },
};

interface PulsechainSubgraphPair {
  id: string;
  token0: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };
  token1: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };
  reserve0: string;
  reserve1: string;
  reserveUSD: string;
}

interface PulsechainSubgraphResponse {
  data?: {
    pairs?: PulsechainSubgraphPair[];
  };
  errors?: Array<{ message: string }>;
}

function buildTokenSearchQuery(term: string): string {
  const escapedTerm = term.replace(/[\\'"]/g, '\\$&');

  return JSON.stringify({
    query: `{
      pairs(
        where: {
          or: [
            { token0_contains_nocase: "${escapedTerm}" }
            { token1_contains_nocase: "${escapedTerm}" }
          ]
        }
        first: 20
        orderBy: reserveUSD
        orderDirection: desc
      ) {
        id
        token0 { id symbol name decimals }
        token1 { id symbol name decimals }
        reserve0
        reserve1
        reserveUSD
      }
    }`,
  });
}

function padUint256(n: number | bigint): string {
  return BigInt(n).toString(16).padStart(64, '0');
}

/**
 * Execute a batch of JSON-RPC `eth_call` requests against a single RPC endpoint and return their results.
 *
 * @param calls - Array of call descriptors, each with `to` (target contract address) and `data` (calldata).
 * @param rpc - RPC endpoint URL to send the batch request to.
 * @returns An array of hex-encoded result strings corresponding to each call in the same order as `calls`. If a response has no result, the entry will be `'0x'`.
 */
async function batchRPC(
  calls: { to: string; data: string }[],
  rpc: string,
): Promise<string[]> {
  const body: RpcBatchRequest[] = calls.map((c, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: 'eth_call',
    params: [{ to: c.to, data: c.data }, 'latest'],
  }));
  const json = await batchRpcCall(body, rpc, fetch);
  return [...json]
    .sort((a, b) => a.id - b.id)
    .map((r) => r.result ?? '0x');
}

/**
 * Send a JSON-RPC batch to the primary RPC endpoint and retry against the fallback RPC if the primary call fails.
 *
 * @param body - Array of JSON-RPC batch request objects to send
 * @returns The array of JSON-RPC batch response objects corresponding to `body` (order preserved)
 */
async function batchRpcRequestWithFallback(
  body: RpcBatchRequest[],
): Promise<RpcBatchResponse[]> {
  try {
    return await batchRpcRequest(body, PRIMARY_RPC);
  } catch {
    return await batchRpcRequest(body, FALLBACK_RPC);
  }
}

/**
 * Execute a batched eth_call against the primary RPC and fall back to the secondary RPC on error.
 *
 * @param calls - Array of RPC call objects with `to` (target address) and `data` (call data hex)
 * @returns An array of hex result strings corresponding to each call (each entry is the RPC `result` or `'0x'` when absent)
 */
async function batchRPCWithFallback(
  calls: { to: string; data: string }[],
): Promise<string[]> {
  try {
    return await batchRPC(calls, PRIMARY_RPC);
  } catch {
    return await batchRPC(calls, FALLBACK_RPC);
  }
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function chunkedBatch(
  calls: { to: string; data: string }[],
): Promise<string[]> {
  const results: string[] = [];
  for (const chunk of chunks(calls, CHUNK_SIZE)) {
    const chunkResults = await batchRPCWithFallback(chunk);
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Searches a Pulsechain Pulsex subgraph for LP pairs matching `term` and returns normalized pair results.
 *
 * The function POSTs a GraphQL token-pair search to `url`, validates the HTTP and subgraph responses,
 * filters results to pairs where either token is WPLS and the WPLS-side reserve meets the minimum threshold,
 * and tags each result with the provided `version`.
 *
 * @param url - Subgraph HTTP endpoint to query
 * @param term - Search term used to match token symbols or names
 * @param version - Subgraph schema version label to prefix result IDs (`'v1'` or `'v2'`)
 * @param signal - Optional AbortSignal to cancel the request
 * @returns An array of `PulsechainTokenSearchResult` objects for pairs containing WPLS and meeting reserve criteria
 * @throws Error when the HTTP response is not OK or when the subgraph returns errors
 */
async function queryPulsechainTokenSearchSubgraph(
  url: string,
  term: string,
  version: 'v1' | 'v2',
  signal?: AbortSignal,
): Promise<PulsechainTokenSearchResult[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: buildTokenSearchQuery(term),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) : AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.ok === false) {
    throw new Error(`Subgraph HTTP ${response.status}`);
  }

  const json: PulsechainSubgraphResponse = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return (json.data?.pairs ?? [])
    .filter(pair => {
      const isToken0Wpls = pair.token0.id.trim().toLowerCase() === WPLS_ADDRESS;
      const isToken1Wpls = pair.token1.id.trim().toLowerCase() === WPLS_ADDRESS;

      if (!isToken0Wpls && !isToken1Wpls) {
        return false;
      }

      const wplsReserve = Number.parseFloat(isToken0Wpls ? pair.reserve0 : pair.reserve1);
      return wplsReserve >= MIN_WPLS_RESERVE;
    })
    .map(pair => ({
      id: `${version}:${pair.id}`,
      pairAddress: pair.id,
      token0: pair.token0,
      token1: pair.token1,
      reserveUSD: pair.reserveUSD,
      version,
    }));
}

function normalizePairResult(pair: PulsechainTokenSearchResult): PulsechainTokenSearchResult {
  return {
    id: pair.id.trim(),
    pairAddress: pair.pairAddress.trim().toLowerCase(),
    token0: {
      id: pair.token0.id.trim().toLowerCase(),
      symbol: pair.token0.symbol.trim().toUpperCase(),
      name: pair.token0.name.trim(),
      decimals: pair.token0.decimals.trim(),
    },
    token1: {
      id: pair.token1.id.trim().toLowerCase(),
      symbol: pair.token1.symbol.trim().toUpperCase(),
      name: pair.token1.name.trim(),
      decimals: pair.token1.decimals.trim(),
    },
    reserveUSD: pair.reserveUSD.trim(),
    version: pair.version,
  };
}

function parseReservePair(hex: string | undefined): [number, number] {
  if (!hex || hex === '0x') {
    return [0, 0];
  }

  const normalized = hex.replace('0x', '').padStart(192, '0');
  return [
    Number(BigInt(`0x${normalized.slice(0, 64)}`)),
    Number(BigInt(`0x${normalized.slice(64, 128)}`)),
  ];
}

function setDerivedPrice(
  prices: Record<string, number>,
  tokenAddress: string,
  priceUsd: number,
): void {
  if (Number.isFinite(priceUsd) && priceUsd > 0) {
    prices[tokenAddress.toLowerCase()] = priceUsd;
  }
}

function getPulsechainTokenName(token: { symbol: string; name?: string }): string {
  if (token.name) {
    return token.name;
  }

  if (token.symbol === 'PLS') {
    return 'PulseChain';
  }

  return token.symbol;
}

export function normalizePulsechainTokenSearchResults(
  pairs: PulsechainTokenSearchResult[],
): PulsechainTokenSearchResult[] {
  const deduped = new Map<string, PulsechainTokenSearchResult>();

  for (const pair of pairs) {
    const normalizedPair = normalizePairResult(pair);
    const currentBest = deduped.get(normalizedPair.pairAddress);

    if (!currentBest || Number.parseFloat(normalizedPair.reserveUSD) > Number.parseFloat(currentBest.reserveUSD)) {
      deduped.set(normalizedPair.pairAddress, normalizedPair);
    }
  }

  return [...deduped.values()].sort(
    (left, right) => Number.parseFloat(right.reserveUSD) - Number.parseFloat(left.reserveUSD),
  );
}

export async function searchPulsechainTokens(
  term: string,
  signal?: AbortSignal,
): Promise<PulsechainTokenSearchResult[]> {
  const results = await Promise.allSettled([
    queryPulsechainTokenSearchSubgraph(SUBGRAPH_URLS.v1, term, 'v1', signal),
    queryPulsechainTokenSearchSubgraph(SUBGRAPH_URLS.v2, term, 'v2', signal),
  ]);

  const fulfilledResults = results
    .filter(
      (result): result is PromiseFulfilledResult<PulsechainTokenSearchResult[]> => result.status === 'fulfilled',
    )
    .flatMap(result => result.value);

  if (results.some(result => result.status === 'fulfilled')) {
    return normalizePulsechainTokenSearchResults(fulfilledResults);
  }

  const rejectedResult = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  throw rejectedResult?.reason instanceof Error
    ? rejectedResult.reason
    : new Error('Pulsechain token search failed');
}

export async function getPulsechainLPPositions(
  walletAddresses: string[],
  tokenPrices: Record<string, number>,
): Promise<LpPositionEnriched[]> {
  if (walletAddresses.length === 0) {
    return [];
  }

  const wallets = walletAddresses.map(address => address.toLowerCase());
  const pairAddrs = Object.keys(PULSEX_PAIR_REGISTRY);

  const walletBalCalls: { to: string; data: string }[] = [];
  const walletBalIndex: { pairAddr: string; walletAddr: string }[] = [];
  const reserveCalls: { to: string; data: string }[] = [];
  const supplyCalls: { to: string; data: string }[] = [];

  for (const pairAddr of pairAddrs) {
    reserveCalls.push({ to: pairAddr, data: '0x0902f1ac' });
    supplyCalls.push({ to: pairAddr, data: '0x18160ddd' });

    for (const wallet of wallets) {
      walletBalCalls.push({
        to: pairAddr,
        data: '0x70a08231' + padAddress(wallet),
      });
      walletBalIndex.push({ pairAddr, walletAddr: wallet });
    }
  }

  const allBaseCalls = [...reserveCalls, ...supplyCalls, ...walletBalCalls];
  const baseResults = await chunkedBatch(allBaseCalls);

  const reserveResults = baseResults.slice(0, pairAddrs.length);
  const supplyResults = baseResults.slice(pairAddrs.length, pairAddrs.length * 2);
  const balResults = baseResults.slice(pairAddrs.length * 2);

  const pairData: Record<string, {
    reserve0: bigint;
    reserve1: bigint;
    totalSupply: bigint;
    walletBalances: Record<string, bigint>;
  }> = {};

  pairAddrs.forEach((pairAddr, index) => {
    const reserveHex = (reserveResults[index] ?? '0x').replace('0x', '').padStart(192, '0');
    const supplyHex = (supplyResults[index] ?? '0x').replace('0x', '').padStart(64, '0');

    pairData[pairAddr] = {
      reserve0: BigInt(`0x${reserveHex.slice(0, 64)}`),
      reserve1: BigInt(`0x${reserveHex.slice(64, 128)}`),
      totalSupply: BigInt(`0x${supplyHex}`),
      walletBalances: {},
    };
  });

  balResults.forEach((hex, index) => {
    const balanceHex = (hex ?? '0x').replace('0x', '').padStart(64, '0');
    const { pairAddr, walletAddr } = walletBalIndex[index];

    pairData[pairAddr].walletBalances[walletAddr] =
      (pairData[pairAddr].walletBalances[walletAddr] ?? 0n) + BigInt(`0x${balanceHex}`);
  });

  let poolCount = 0;
  try {
    const poolLenRes = await batchRPCWithFallback([
      { to: MASTERCHEF, data: '0x081e3eda' },
    ]);
    poolCount = Math.min(
      parseInt((poolLenRes[0] ?? '0x0').replace('0x', '') || '0', 16),
      POOL_CAP,
    );
  } catch {
    poolCount = 0;
  }

  const lpToPool: Record<string, number> = {};
  const stakedMap: Record<number, Record<string, { staked: bigint; pendingInc: bigint }>> = {};

  if (poolCount > 0) {
    const poolInfoCalls = Array.from({ length: poolCount }, (_, poolId) => ({
      to: MASTERCHEF,
      data: '0x1526fe27' + padUint256(poolId),
    }));
    const poolInfoResults = await chunkedBatch(poolInfoCalls);

    poolInfoResults.forEach((hex, poolId) => {
      if (!hex || hex === '0x') {
        return;
      }

      const clean = hex.replace('0x', '').padStart(64, '0');
      const lpToken = `0x${clean.slice(24, 64).toLowerCase()}`;

      if (pairAddrs.includes(lpToken)) {
        lpToPool[lpToken] = poolId;
      }
    });

    const relevantPools = Object.values(lpToPool);
    if (relevantPools.length > 0) {
      const userCalls: { to: string; data: string }[] = [];
      const userCallIndex: { pid: number; wallet: string; type: 'user' | 'pending' }[] = [];

      for (const pid of relevantPools) {
        for (const wallet of wallets) {
          userCalls.push({
            to: MASTERCHEF,
            data: '0x93f1a40b' + padUint256(pid) + padAddress(wallet),
          });
          userCallIndex.push({ pid, wallet, type: 'user' });

          userCalls.push({
            to: MASTERCHEF,
            data: '0xf40f0f52' + padUint256(pid) + padAddress(wallet),
          });
          userCallIndex.push({ pid, wallet, type: 'pending' });
        }
      }

      const userResults = await chunkedBatch(userCalls);
      userResults.forEach((hex, index) => {
        const { pid, wallet, type } = userCallIndex[index];
        if (!hex || hex === '0x') {
          return;
        }

        const clean = hex.replace('0x', '').padStart(64, '0');
        const value = BigInt(`0x${clean.slice(0, 64)}`);

        if (!stakedMap[pid]) {
          stakedMap[pid] = {};
        }
        if (!stakedMap[pid][wallet]) {
          stakedMap[pid][wallet] = { staked: 0n, pendingInc: 0n };
        }

        if (type === 'user') {
          stakedMap[pid][wallet].staked += value;
        } else {
          stakedMap[pid][wallet].pendingInc += value;
        }
      });
    }
  }

  const volume24h: Record<string, number> = {};
  try {
    const query = `{
      pairDayDatas(
        first: ${pairAddrs.length}
        orderBy: date
        orderDirection: desc
        where: { pairAddress_in: ${JSON.stringify(pairAddrs)} }
      ) { pairAddress dailyVolumeUSD }
    }`;
    const subgraphResponse = await fetch(SUBGRAPH_URLS.v1, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    });

    if (subgraphResponse.ok) {
      const subgraphData: {
        data?: {
          pairDayDatas?: { pairAddress: string; dailyVolumeUSD: string }[];
        };
      } = await subgraphResponse.json();

      subgraphData.data?.pairDayDatas?.forEach(entry => {
        volume24h[entry.pairAddress.toLowerCase()] = parseFloat(entry.dailyVolumeUSD) || 0;
      });
    }
  } catch {
    // Optional enrichment only.
  }

  const incPrice = tokenPrices.INC ?? 0;
  const positions: LpPositionEnriched[] = [];

  for (const pairAddr of pairAddrs) {
    const meta = PULSEX_PAIR_REGISTRY[pairAddr];
    const data = pairData[pairAddr];

    if (!data || data.totalSupply === 0n) {
      continue;
    }

    const walletBalance = wallets.reduce(
      (sum, wallet) => sum + (data.walletBalances[wallet] ?? 0n),
      0n,
    );

    const poolId = lpToPool[pairAddr];
    const isStaked = poolId !== undefined;
    let stakedBalance = 0n;
    let pendingIncTotal = 0n;

    if (isStaked) {
      for (const wallet of wallets) {
        stakedBalance += stakedMap[poolId]?.[wallet]?.staked ?? 0n;
        pendingIncTotal += stakedMap[poolId]?.[wallet]?.pendingInc ?? 0n;
      }
    }

    const userLPBalance = walletBalance + stakedBalance;
    if (userLPBalance === 0n) {
      continue;
    }

    const totalSupply = Number(data.totalSupply) / 1e18;
    const userShare = Number(userLPBalance) / Number(data.totalSupply);
    const token0Amount = (Number(data.reserve0) / (10 ** meta.token0Decimals)) * userShare;
    const token1Amount = (Number(data.reserve1) / (10 ** meta.token1Decimals)) * userShare;
    const token0PriceUsd = tokenPrices[meta.token0Symbol] ?? 0;
    const token1PriceUsd = tokenPrices[meta.token1Symbol] ?? 0;
    const token0Usd = token0Amount * token0PriceUsd;
    const token1Usd = token1Amount * token1PriceUsd;
    const totalUsd = token0Usd + token1Usd;
    const ownershipPct = userShare * 100;
    const volume24hUsd = volume24h[pairAddr] ?? null;
    const fees24hUsd = volume24hUsd !== null ? volume24hUsd * 0.003 * userShare : null;

    const entryKey = `lp_entry_${pairAddr}`;
    const currentRatio = token1Amount > 0 ? token0Amount / token1Amount : 0;
    let ilEstimate: number | null = null;

    try {
      const saved = globalThis.localStorage?.getItem(entryKey);
      if (saved) {
        const { ratio: priceEntry } = JSON.parse(saved) as { ratio: number };
        if (priceEntry > 0 && currentRatio > 0) {
          const priceRatio = currentRatio / priceEntry;
          ilEstimate = ((2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1) * 100;
        }
      } else if (currentRatio > 0) {
        globalThis.localStorage?.setItem(
          entryKey,
          JSON.stringify({ ratio: currentRatio, timestamp: Date.now() }),
        );
      }
    } catch {
      ilEstimate = null;
    }

    const pendingIncUsd = (Number(pendingIncTotal) / 1e18) * incPrice;

    positions.push({
      pairAddress: pairAddr,
      pairName: `${meta.token0Symbol}/${meta.token1Symbol}`,
      token0Address: meta.token0Address,
      token1Address: meta.token1Address,
      token0Symbol: meta.token0Symbol,
      token1Symbol: meta.token1Symbol,
      token0Decimals: meta.token0Decimals,
      token1Decimals: meta.token1Decimals,
      token0Amount,
      token1Amount,
      token0Usd,
      token1Usd,
      totalUsd,
      lpBalance: Number(userLPBalance) / 1e18,
      totalSupply,
      ownershipPct,
      reserve0: Number(data.reserve0) / (10 ** meta.token0Decimals),
      reserve1: Number(data.reserve1) / (10 ** meta.token1Decimals),
      token0PriceUsd,
      token1PriceUsd,
      ilEstimate,
      fees24hUsd,
      volume24hUsd,
      isStaked,
      poolId: isStaked ? poolId : undefined,
      pendingIncUsd: isStaked ? pendingIncUsd : undefined,
      walletLpBalance: Number(walletBalance) / 1e18,
      stakedLpBalance: Number(stakedBalance) / 1e18,
      sparkline: Array.from({ length: 7 }, (_, index) => ({
        t: Date.now() - (6 - index) * 86400000,
        v: totalUsd * (0.95 + Math.sin(index * 0.8 + (totalUsd % 3)) * 0.04 + index * 0.005),
      })),
    });
  }

  positions.sort((left, right) => right.totalUsd - left.totalUsd);

  return positions;
}

async function getPulsechainPriceSourceMap(): Promise<Record<string, number>> {
  const lpKeys = Object.keys(PULSEX_LP_PAIRS) as Array<keyof typeof PULSEX_LP_PAIRS>;
  const reserveResults = await batchRPC(
    lpKeys.map(key => ({ to: PULSEX_LP_PAIRS[key], data: '0x0902f1ac' })),
    PRIMARY_RPC,
  ).catch(() => batchRPC(
    lpKeys.map(key => ({ to: PULSEX_LP_PAIRS[key], data: '0x0902f1ac' })),
    FALLBACK_RPC,
  ));

  const reserveByKey = lpKeys.reduce<Record<string, string>>((acc, key, index) => {
    acc[key] = reserveResults[index] ?? '0x';
    return acc;
  }, {});

  const [daiR0, daiR1] = parseReservePair(reserveByKey.WPLS_DAI);
  const [usdcR0, usdcR1] = parseReservePair(reserveByKey.WPLS_USDC);
  const [usdtR0, usdtR1] = parseReservePair(reserveByKey.WPLS_USDT);

  const wplsFromUsdc = usdcR0 > 0 && usdcR1 > 0 ? (usdcR0 / 1e6) / (usdcR1 / 1e18) : 0;
  const wplsFromUsdt = usdtR0 > 0 && usdtR1 > 0 ? (usdtR0 / 1e6) / (usdtR1 / 1e18) : 0;
  const wplsUsd = Math.max(wplsFromUsdc, wplsFromUsdt);

  if (!(wplsUsd > 0)) {
    return {};
  }

  const prices: Record<string, number> = {
    native: wplsUsd,
    [WPLS_ADDRESS]: wplsUsd,
  };

  const [plsxR0, plsxR1] = parseReservePair(reserveByKey.PLSX_WPLS);
  if (plsxR0 > 0 && plsxR1 > 0) {
    setDerivedPrice(prices, '0x95b303987a60c71504d99aa1b13b4da07b0790ab', (plsxR1 / plsxR0) * wplsUsd);
  }

  const [incR0, incR1] = parseReservePair(reserveByKey.INC_WPLS);
  if (incR0 > 0 && incR1 > 0) {
    setDerivedPrice(prices, '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', (incR1 / incR0) * wplsUsd);
  }

  const [hexR0, hexR1] = parseReservePair(reserveByKey.PHEX_WPLS);
  if (hexR0 > 0 && hexR1 > 0) {
    setDerivedPrice(prices, '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', ((hexR1 / 1e18) / (hexR0 / 1e8)) * wplsUsd);
  }

  const [wethR0, wethR1] = parseReservePair(reserveByKey.PWETH_WPLS);
  if (wethR0 > 0 && wethR1 > 0) {
    setDerivedPrice(prices, '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', (wethR1 / wethR0) * wplsUsd);
  }

  const [wbtcR0, wbtcR1] = parseReservePair(reserveByKey.PWBTC_WPLS);
  if (wbtcR0 > 0 && wbtcR1 > 0) {
    setDerivedPrice(prices, '0xb17d901469b9208b17d916112988a3fed19b5ca1', ((wbtcR0 / 1e18) / (wbtcR1 / 1e8)) * wplsUsd);
  }

  if (daiR0 > 0 && daiR1 > 0) {
    setDerivedPrice(prices, '0xefd766ccb38eaf1dfd701853bfce31359239f305', (daiR0 / daiR1) * wplsUsd);
  }

  if (usdcR0 > 0 && usdcR1 > 0) {
    setDerivedPrice(prices, '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', (usdcR1 / 1e18) / (usdcR0 / 1e6) * wplsUsd);
  }

  if (usdtR0 > 0 && usdtR1 > 0) {
    setDerivedPrice(prices, '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', (usdtR1 / 1e18) / (usdtR0 / 1e6) * wplsUsd);
  }

  const [pdaiSysR0, pdaiSysR1] = parseReservePair(reserveByKey.PDAI_SYS_WPLS);
  if (pdaiSysR0 > 0 && pdaiSysR1 > 0) {
    setDerivedPrice(prices, '0x6b175474e89094c44da98b954eedeac495271d0f', (pdaiSysR1 / pdaiSysR0) * wplsUsd);
  }

  const [prvxUsdcR0, prvxUsdcR1] = parseReservePair(reserveByKey.PRVX_USDC);
  if (prvxUsdcR0 > 0 && prvxUsdcR1 > 0) {
    setDerivedPrice(prices, '0xf6f8db0aba00007681f8faf16a0fda1c9b030b11', (prvxUsdcR0 / 1e6) / (prvxUsdcR1 / 1e18));
  }

  return prices;
}

/**
 * Fetches USD prices from CoinGecko for the given PulseChain token addresses.
 *
 * Looks up CoinGecko IDs for addresses present in the built-in token list and returns a map
 * from each matched token's lowercased address to its USD price. If no matching CoinGecko IDs
 * are found, an empty object is returned.
 *
 * @param tokenAddresses - Array of token contract addresses to query
 * @returns A record mapping each matched token's lowercased address to its USD price
 * @throws Error if the CoinGecko HTTP request returns a non-OK response
 */
async function getCoinGeckoPriceSourceMap(tokenAddresses: string[]): Promise<Record<string, number>> {
  const requestedAddresses = new Set(tokenAddresses.map(address => address.trim().toLowerCase()));
  const requestedTokens = TOKENS.pulsechain.filter(token => requestedAddresses.has(token.address.toLowerCase()));
  const coinGeckoIds = [...new Set(requestedTokens.map(token => token.coinGeckoId))];

  if (coinGeckoIds.length === 0) {
    return {};
  }

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoIds.join(',')}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );

  if (response.ok === false) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }

  const json = await response.json() as Record<string, { usd?: number }>;
  return requestedTokens.reduce<Record<string, number>>((prices, token) => {
    const price = json[token.coinGeckoId]?.usd;

    if (Number.isFinite(price) && (price ?? 0) > 0) {
      prices[token.address.toLowerCase()] = price as number;
    }

    return prices;
  }, {});
}

export async function getPulsechainPrices(tokenAddresses: string[]): Promise<PriceQuote[]> {
  const requests = tokenAddresses.map(tokenAddress => ({
    tokenAddress: tokenAddress.trim().toLowerCase(),
    chain: 'pulsechain' as const,
  }));

  if (requests.length === 0) {
    return [];
  }

  const [pulseXResult, coinGeckoResult] = await Promise.allSettled([
    getPulsechainPriceSourceMap(),
    getCoinGeckoPriceSourceMap(requests.map(request => request.tokenAddress)),
  ]);

  return resolvePriceQuotes(requests, {
    pulseX: pulseXResult.status === 'fulfilled' ? pulseXResult.value : {},
    coinGecko: coinGeckoResult.status === 'fulfilled' ? coinGeckoResult.value : {},
  });
}

export async function getPulsechainTokenBalances(address: string): Promise<TokenBalance[]> {
  const requests: RpcBatchRequest[] = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    },
    ...TOKENS.pulsechain
      .filter(token => token.address !== 'native')
      .map((token, index) => ({
        jsonrpc: '2.0' as const,
        id: index + 2,
        method: 'eth_call' as const,
        params: [{ to: token.address, data: `0x70a08231${padAddress(address.toLowerCase())}` }, 'latest'],
      })),
  ];

  const responses = await batchRpcCall(requests, PRIMARY_RPC, fetch).catch(() => batchRpcCall(requests, FALLBACK_RPC, fetch));
  const resultsById = responses.reduce<Record<number, string>>((acc, response) => {
    acc[response.id] = response.result ?? '0x';
    return acc;
  }, {});

  return TOKENS.pulsechain.reduce<TokenBalance[]>((balances, token, index) => {
    const resultId = token.address === 'native' ? 1 : index + 1;
    const rawBalance = parseBigIntResult(resultsById[resultId]);
    const balance = Number(formatUnits(rawBalance, token.decimals));

    if (!(balance > 0)) {
      return balances;
    }

    balances.push({
      address: token.address.toLowerCase(),
      symbol: token.symbol,
      name: getPulsechainTokenName(token),
      decimals: token.decimals,
      balance,
      chain: 'pulsechain',
    });

    return balances;
  }, []);
}
