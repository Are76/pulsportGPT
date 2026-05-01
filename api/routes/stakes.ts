import { Router } from 'express';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
import { validateAddress } from '../middleware/validate';
import { getCached, setCached } from '../middleware/cache';
import { getStakesCache, upsertStakesCache } from '../db/queries';
import { CHAINS, HEX_ABI, PHEX_YIELD_BI_NUM, PHEX_YIELD_BI_DEN, EHEX_YIELD_BI_NUM, EHEX_YIELD_BI_DEN } from '../../src/constants';

const router = Router();

const STAKES_TTL = 300;
const FETCH_TIMEOUT = 15_000;

type StakeChain = 'pulsechain' | 'ethereum';

interface StakeRecord {
  id: string;
  stakeId: number;
  stakedHearts: string;
  stakeShares: string;
  lockedDay: number;
  stakedDays: number;
  unlockedDay: number;
  isAutoStake: boolean;
  progress: number;
  daysRemaining: number;
  tShares: number;
  stakedHex: number;
  chain: StakeChain;
  walletAddress: string;
}

async function rpcCall(rpc: string, data: string, to: string): Promise<string> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result ?? '0x';
}

async function loadStakesOnChain(address: string, chain: StakeChain): Promise<StakeRecord[]> {
  const chainConfig = CHAINS[chain];
  const rpc = chainConfig.rpc;
  const hexAddress = chainConfig.hexAddress as `0x${string}`;
  const addr = address as `0x${string}`;

  // currentDay
  const currentDayData = encodeFunctionData({ abi: HEX_ABI, functionName: 'currentDay' });
  const currentDayHex = await rpcCall(rpc, currentDayData, hexAddress);
  const currentDay = Number(decodeFunctionResult({ abi: HEX_ABI, functionName: 'currentDay', data: currentDayHex as `0x${string}` }));

  // stakeCount
  const stakeCountData = encodeFunctionData({ abi: HEX_ABI, functionName: 'stakeCount', args: [addr] });
  const stakeCountHex = await rpcCall(rpc, stakeCountData, hexAddress);
  const stakeCount = Number(decodeFunctionResult({ abi: HEX_ABI, functionName: 'stakeCount', data: stakeCountHex as `0x${string}` }));

  if (stakeCount === 0) return [];

  const yieldBiNum = chain === 'pulsechain' ? PHEX_YIELD_BI_NUM : EHEX_YIELD_BI_NUM;
  const yieldBiDen = chain === 'pulsechain' ? PHEX_YIELD_BI_DEN : EHEX_YIELD_BI_DEN;

  const stakes: StakeRecord[] = [];
  const settled = await Promise.allSettled(
    Array.from({ length: stakeCount }, async (_, index) => {
      const data = encodeFunctionData({ abi: HEX_ABI, functionName: 'stakeLists', args: [addr, BigInt(index)] });
      const hex = await rpcCall(rpc, data, hexAddress);
      return decodeFunctionResult({ abi: HEX_ABI, functionName: 'stakeLists', data: hex as `0x${string}` }) as unknown as readonly [number, bigint, bigint, number, number, number, boolean];
    }),
  );

  for (const result of settled) {
    if (result.status === 'rejected') continue;
    const [stakeId, stakedHearts, stakeShares, lockedDay, stakedDays, unlockedDay, isAutoStake] = result.value;

    const lockedDayN = Number(lockedDay);
    const stakedDaysN = Number(stakedDays);
    const daysStaked = Math.max(0, currentDay - lockedDayN);
    const daysRemaining = Math.max(0, lockedDayN + stakedDaysN - currentDay);
    const progress = Math.min(100, Math.max(0, (daysStaked / Math.max(1, stakedDaysN)) * 100));
    const tShares = Number(stakeShares) / 1e12;
    const stakedHex = Number(stakedHearts) / 1e8;

    // Estimate full-term yield: shares * days * rate
    const fullYieldHearts = (stakeShares * BigInt(stakedDaysN) * yieldBiNum) / yieldBiDen;
    const stakeHexYield = Number(fullYieldHearts) / 1e8;

    stakes.push({
      id: `${chain}-${address}-${stakeId}`,
      stakeId: Number(stakeId),
      stakedHearts: stakedHearts.toString(),
      stakeShares: stakeShares.toString(),
      lockedDay: lockedDayN,
      stakedDays: stakedDaysN,
      unlockedDay: Number(unlockedDay),
      isAutoStake,
      progress: Math.round(progress),
      daysRemaining,
      tShares,
      stakedHex,
      chain,
      walletAddress: address,
      // stakeHexYield is included for UI reference
      ...({ stakeHexYield } as { stakeHexYield: number }),
    });
  }

  return stakes;
}

// GET /api/v1/stakes/:address?chain=pulsechain
router.get('/:address', validateAddress(), async (req, res) => {
  const { address } = req.params;
  const chainParam = (req.query.chain as string) ?? 'pulsechain';

  if (!['pulsechain', 'ethereum'].includes(chainParam)) {
    res.status(400).json({
      ok: false,
      error: 'INVALID_CHAIN',
      message: 'chain must be pulsechain or ethereum for HEX stakes',
    });
    return;
  }

  const chain = chainParam as StakeChain;
  const cacheKey = `stakes:${chain}:${address}`;

  const memCached = getCached(cacheKey);
  if (memCached) {
    res.json({ ok: true, ...memCached });
    return;
  }

  const dbCache = getStakesCache(address, chain);
  const now = Math.floor(Date.now() / 1000);
  const dbAge = dbCache ? now - dbCache.updated_at : Infinity;
  if (dbCache && dbAge < STAKES_TTL) {
    const data = { chain, address, stakes: JSON.parse(dbCache.stakes_json) as StakeRecord[] };
    const ttlRemaining = STAKES_TTL - dbAge;
    setCached(cacheKey, data, ttlRemaining);
    res.json({ ok: true, data, cachedAt: dbCache.updated_at, ttlRemaining });
    return;
  }

  try {
    const stakes = await loadStakesOnChain(address, chain);
    upsertStakesCache(address, chain, JSON.stringify(stakes));

    const data = { chain, address, stakes };
    setCached(cacheKey, data, STAKES_TTL);
    const cachedAt = Math.floor(Date.now() / 1000);
    res.json({ ok: true, data, cachedAt, ttlRemaining: STAKES_TTL });
  } catch (err) {
    if (dbCache) {
      const data = { chain, address, stakes: JSON.parse(dbCache.stakes_json) as StakeRecord[] };
      res.json({ ok: true, data, cachedAt: dbCache.updated_at, ttlRemaining: 0 });
      return;
    }
    res.status(502).json({
      ok: false,
      error: 'UPSTREAM_ERROR',
      message: err instanceof Error ? err.message : 'Failed to fetch HEX stakes',
    });
  }
});

export default router;
