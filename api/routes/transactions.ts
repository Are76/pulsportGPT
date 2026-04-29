import { Router } from 'express';
import { validateAddress, validateChain } from '../middleware/validate';
import { getCached, setCached } from '../middleware/cache';
import { getTxnCache, upsertTxnCache } from '../db/queries';

const router = Router();

const TXN_TTL = 120;
const FETCH_TIMEOUT = 20_000;

const BLOCKSCOUT_PULSECHAIN = 'https://api.scan.pulsechain.com/api/v2';
const BLOCKSCOUT_BASE = 'https://base.blockscout.com/api/v2';

interface NormalizedTx {
  hash: string;
  timestamp: number;
  type: 'in' | 'out';
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  chain: string;
  blockNumber: number;
}

interface FetchResult {
  txns: NormalizedTx[];
  lastBlock: number;
}

async function fetchBlockscoutTxns(
  baseUrl: string,
  address: string,
  chain: string,
  startBlock: number,
): Promise<FetchResult> {
  const url = `${baseUrl}/addresses/${address}/transactions?filter=from%7Cto&limit=50`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) return { txns: [], lastBlock: startBlock };

  const json = await res.json() as {
    items?: Array<{
      hash: string;
      timestamp?: string | null;
      from?: { hash?: string } | null;
      to?: { hash?: string } | null;
      value?: string | null;
      gas_used?: string | null;
      block?: number | null;
    }>;
  };

  const items = json.items ?? [];
  const txns: NormalizedTx[] = items
    .filter(item => (item.block ?? 0) > startBlock)
    .map(item => ({
      hash: item.hash,
      timestamp: item.timestamp ? new Date(item.timestamp).getTime() : 0,
      type: (item.from?.hash?.toLowerCase() === address.toLowerCase() ? 'out' : 'in') as 'in' | 'out',
      from: (item.from?.hash ?? '').toLowerCase(),
      to: (item.to?.hash ?? '').toLowerCase(),
      value: item.value ?? '0',
      gasUsed: item.gas_used ?? undefined,
      chain,
      blockNumber: item.block ?? 0,
    }));

  const lastBlock = txns.reduce((max, t) => Math.max(max, t.blockNumber), startBlock);
  return { txns, lastBlock };
}

async function fetchEtherscanTxns(address: string, startBlock: number, apiKey?: string): Promise<FetchResult> {
  const keyParam = apiKey ? `&apikey=${apiKey}` : '';
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist` +
    `&address=${address}&startblock=${startBlock}&endblock=99999999&page=1&offset=50&sort=desc${keyParam}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) return { txns: [], lastBlock: startBlock };

  const json = await res.json() as {
    result?: Array<{
      hash: string;
      timeStamp: string;
      from: string;
      to: string;
      value: string;
      blockNumber: string;
      gasUsed: string;
    }>;
  };

  const items = Array.isArray(json.result) ? json.result : [];
  const txns: NormalizedTx[] = items.map(item => ({
    hash: item.hash,
    timestamp: Number(item.timeStamp) * 1000,
    type: (item.from.toLowerCase() === address.toLowerCase() ? 'out' : 'in') as 'in' | 'out',
    from: item.from.toLowerCase(),
    to: item.to.toLowerCase(),
    value: item.value,
    gasUsed: item.gasUsed,
    chain: 'ethereum',
    blockNumber: Number(item.blockNumber),
  }));

  const lastBlock = txns.reduce((max, t) => Math.max(max, t.blockNumber), startBlock);
  return { txns, lastBlock };
}

// GET /api/v1/txns/:chain/:address?startBlock=N&apiKey=K
router.get('/:chain/:address', validateChain(), validateAddress(), async (req, res) => {
  const { chain, address } = req.params;
  const startBlock = Number(req.query.startBlock ?? 0) || 0;
  const etherscanKey = req.query.apiKey as string | undefined;

  const cacheKey = `txns:${chain}:${address}`;
  const memCached = getCached(cacheKey);
  if (memCached) {
    res.json({ ok: true, ...memCached });
    return;
  }

  // Check DB cache
  const dbCache = getTxnCache(chain, address);
  const now = Math.floor(Date.now() / 1000);
  const dbAge = dbCache ? now - dbCache.updated_at : Infinity;
  if (dbCache && dbAge < TXN_TTL) {
    const data = { chain, address, transactions: JSON.parse(dbCache.raw_txns) as NormalizedTx[] };
    const ttlRemaining = TXN_TTL - dbAge;
    setCached(cacheKey, data, ttlRemaining);
    res.json({ ok: true, data, cachedAt: dbCache.updated_at, ttlRemaining });
    return;
  }

  try {
    let result: FetchResult;
    const fromBlock = dbCache?.last_block ?? startBlock;

    if (chain === 'pulsechain') {
      result = await fetchBlockscoutTxns(BLOCKSCOUT_PULSECHAIN, address, chain, fromBlock);
    } else if (chain === 'base') {
      result = await fetchBlockscoutTxns(BLOCKSCOUT_BASE, address, chain, fromBlock);
    } else {
      result = await fetchEtherscanTxns(address, fromBlock, etherscanKey);
    }

    // Merge new txns with any existing cached ones
    const existing: NormalizedTx[] = dbCache ? JSON.parse(dbCache.raw_txns) : [];
    const existingHashes = new Set(existing.map(t => t.hash));
    const merged = [...result.txns.filter(t => !existingHashes.has(t.hash)), ...existing].slice(0, 200);

    upsertTxnCache(chain, address, result.lastBlock, JSON.stringify(merged));

    const data = { chain, address, transactions: merged };
    setCached(cacheKey, data, TXN_TTL);
    const cachedAt = Math.floor(Date.now() / 1000);
    res.json({ ok: true, data, cachedAt, ttlRemaining: TXN_TTL });
  } catch (err) {
    if (dbCache) {
      const data = { chain, address, transactions: JSON.parse(dbCache.raw_txns) as NormalizedTx[] };
      res.json({ ok: true, data, cachedAt: dbCache.updated_at, ttlRemaining: 0 });
      return;
    }
    res.status(502).json({
      ok: false,
      error: 'UPSTREAM_ERROR',
      message: err instanceof Error ? err.message : 'Failed to fetch transactions',
    });
  }
});

export default router;
