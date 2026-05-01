import { Router } from 'express';
import { validateAddress } from '../middleware/validate';
import { getCached, setCached } from '../middleware/cache';
import { getSnapshots, getPortfolioHistory, upsertPortfolioHistory, getTxnCache } from '../db/queries';
import { CHAINS, TOKENS } from '../../src/constants';

const router = Router();

const PORTFOLIO_TTL = 60;
const HISTORY_TTL = 300;
const FETCH_TIMEOUT = 12_000;
const VALID_CHAINS = ['pulsechain', 'ethereum', 'base'] as const;
type SupportedChain = (typeof VALID_CHAINS)[number];

function padAddress(addr: string): string {
  return addr.replace('0x', '').padStart(64, '0');
}

function parseBigInt(hex: string | undefined): bigint {
  const n = (hex ?? '0x0').replace('0x', '') || '0';
  return BigInt(`0x${n}`);
}

interface TokenResult {
  symbol: string;
  address: string;
  balance: number;
  decimals: number;
}

interface ChainResult {
  nativeBalance: number;
  nativeSymbol: string;
  tokens: TokenResult[];
}

async function fetchChainBalances(chain: SupportedChain, address: string): Promise<ChainResult> {
  const chainConfig = CHAINS[chain];
  const rpc = chainConfig.rpc;
  const chainTokens = TOKENS[chain];

  // Native balance
  const nativeRes = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [address, 'latest'] }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  const nativeJson = await nativeRes.json() as { result?: string };
  const nativeRaw = parseBigInt(nativeJson.result);
  const nativeToken = chainTokens.find(t => t.address === 'native');
  const nativeDecimals = nativeToken?.decimals ?? 18;
  const nativeBalance = Number(nativeRaw) / 10 ** nativeDecimals;

  // ERC-20 balances via batch eth_call
  const erc20Tokens = chainTokens.filter(t => t.address !== 'native');
  let tokenResults: TokenResult[] = [];

  if (erc20Tokens.length > 0) {
    const batch = erc20Tokens.map((token, i) => ({
      jsonrpc: '2.0',
      id: i + 1,
      method: 'eth_call',
      params: [{ to: token.address, data: `0x70a08231${padAddress(address)}` }, 'latest'],
    }));

    try {
      const erc20Res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      const erc20Json = await erc20Res.json() as Array<{ id: number; result?: string }>;
      const byId = new Map<number, string>();
      for (const r of erc20Json) byId.set(r.id, r.result ?? '0x');

      tokenResults = erc20Tokens
        .map((token, i) => {
          const raw = parseBigInt(byId.get(i + 1));
          const balance = Number(raw) / 10 ** token.decimals;
          return { symbol: token.symbol, address: token.address.toLowerCase(), balance, decimals: token.decimals };
        })
        .filter(t => t.balance > 0);
    } catch {
      // ERC-20 batch failed; native balance is still returned
    }
  }

  return { nativeBalance, nativeSymbol: nativeToken?.symbol ?? 'native', tokens: tokenResults };
}

// GET /api/v1/portfolio/:address?chains=pulsechain,ethereum,base
router.get('/:address', validateAddress(), async (req, res) => {
  const { address } = req.params;
  const chainsParam = (req.query.chains as string | undefined) ?? 'pulsechain,ethereum,base';
  const chains = chainsParam
    .split(',')
    .map(c => c.trim())
    .filter((c): c is SupportedChain => VALID_CHAINS.includes(c as SupportedChain));

  if (chains.length === 0) {
    res.status(400).json({ ok: false, error: 'INVALID_CHAINS', message: 'No valid chains specified' });
    return;
  }

  const cacheKey = `portfolio:${address}:${[...chains].sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json({ ok: true, ...cached });
    return;
  }

  const chainData: Record<string, ChainResult | { error: string }> = {};
  await Promise.allSettled(
    chains.map(async chain => {
      try {
        chainData[chain] = await fetchChainBalances(chain, address);
      } catch (err) {
        chainData[chain] = { error: err instanceof Error ? err.message : 'fetch failed' };
      }
    }),
  );

  const data = { address, chains: chainData };
  setCached(cacheKey, data, PORTFOLIO_TTL);
  const cachedAt = Math.floor(Date.now() / 1000);
  res.json({ ok: true, data, cachedAt, ttlRemaining: PORTFOLIO_TTL });
});

// GET /api/v1/portfolio/:address/history?days=30
router.get('/:address/history', validateAddress(), (req, res) => {
  const { address } = req.params;
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));

  const cacheKey = `history:${address}:${days}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json({ ok: true, ...cached });
    return;
  }

  // Try rich daily history first (transaction-replay based, supports 365 days)
  const historyRows = getPortfolioHistory(address, days);
  if (historyRows.length > 0) {
    const data = historyRows.map(r => ({
      timestamp: new Date(r.date + 'T00:00:00Z').getTime(),
      totalUsd: r.total_usd,
      nativeUsd: r.native_usd,
      chainDist: JSON.parse(r.chain_dist) as Record<string, number>,
      pnl24hUsd: null,
      netFlowUsd: r.net_flow_usd,
    }));
    setCached(cacheKey, data, HISTORY_TTL);
    const cachedAt = Math.floor(Date.now() / 1000);
    res.json({ ok: true, data, cachedAt, ttlRemaining: HISTORY_TTL });
    return;
  }

  // Fall back to point-in-time snapshots
  const rows = getSnapshots(address, days);
  const data = rows.map(r => ({
    timestamp: r.captured_at * 1000,
    totalUsd: r.total_usd,
    nativeUsd: r.native_usd,
    chainDist: JSON.parse(r.chain_dist) as Record<string, number>,
    pnl24hUsd: r.pnl_24h_usd,
  }));

  setCached(cacheKey, data, HISTORY_TTL);
  const cachedAt = Math.floor(Date.now() / 1000);
  res.json({ ok: true, data, cachedAt, ttlRemaining: HISTORY_TTL });
});

// POST /api/v1/portfolio/:address/history — upsert a daily snapshot row
// (called by the frontend after each portfolio refresh)
router.post('/:address/history', validateAddress(), (req, res) => {
  const { address } = req.params;
  const { date, totalUsd, nativeUsd, chainDist, netFlowUsd } = req.body as {
    date?: string;
    totalUsd?: number;
    nativeUsd?: number;
    chainDist?: Record<string, number>;
    netFlowUsd?: number;
  };

  if (
    typeof date !== 'string' ||
    typeof totalUsd !== 'number' ||
    typeof nativeUsd !== 'number'
  ) {
    res.status(400).json({ ok: false, error: 'INVALID_BODY', message: 'date, totalUsd, nativeUsd are required' });
    return;
  }

  try {
    upsertPortfolioHistory(
      address,
      date,
      totalUsd,
      nativeUsd,
      JSON.stringify(chainDist ?? {}),
      netFlowUsd ?? 0,
    );
    res.json({ ok: true, data: { address, date } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'DB_ERROR',
      message: err instanceof Error ? err.message : 'Failed to upsert history',
    });
  }
});

// GET /api/v1/portfolio/:address/pnl — server-side FIFO realized/unrealized P&L
// Computed from stored transaction cache entries (raw_txns from txn_cache table)
router.get('/:address/pnl', validateAddress(), (req, res) => {
  const { address } = req.params;

  const cacheKey = `pnl:${address}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json({ ok: true, ...cached });
    return;
  }

  // Aggregate raw transactions from all chains stored in txn_cache
  const chains = ['pulsechain', 'ethereum', 'base'] as const;
  type NormalizedTx = {
    hash: string;
    timestamp: number;
    type: 'in' | 'out';
    from: string;
    to: string;
    value: string;
    chain: string;
  };

  const allTxs: NormalizedTx[] = [];
  for (const chain of chains) {
    try {
      const row = getTxnCache(chain, address.toLowerCase());
      if (row) {
        const txs = JSON.parse(row.raw_txns) as NormalizedTx[];
        allTxs.push(...txs);
      }
    } catch {
      // chain had no cached txns — continue
    }
  }

  // Simple FIFO P&L over in/out flows (token-agnostic, USD value basis)
  const lots: { value: number }[] = [];
  let realizedGainUsd = 0;
  let costBasisUsd = 0;

  const sorted = allTxs
    .filter(tx => tx.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const tx of sorted) {
    const usd = Number(tx.value) / 1e18; // raw value is in native units; approximation only
    if (tx.type === 'in') {
      lots.push({ value: usd });
      costBasisUsd += usd;
    } else if (tx.type === 'out' && lots.length > 0) {
      const lot = lots.shift()!;
      realizedGainUsd += usd - lot.value;
    }
  }

  const unrealizedCostBasisUsd = lots.reduce((sum, l) => sum + l.value, 0);

  const data = {
    address,
    realizedGainUsd,
    unrealizedCostBasisUsd,
    unrealizedGainUsd: 0, // requires current prices; computed client-side
    costBasisUsd,
  };

  setCached(cacheKey, data, PORTFOLIO_TTL);
  const cachedAt = Math.floor(Date.now() / 1000);
  res.json({ ok: true, data, cachedAt, ttlRemaining: PORTFOLIO_TTL });
});

export default router;
