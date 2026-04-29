import { Router } from 'express';
import { validateAddress } from '../middleware/validate';
import { getCached, setCached } from '../middleware/cache';
import { getSnapshots } from '../db/queries';
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

export default router;
