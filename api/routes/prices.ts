import { Router } from 'express';
import { getCached, setCached } from '../middleware/cache';
import { upsertPrice } from '../db/queries';
import { TOKENS } from '../../src/constants';

const router = Router();

const PRICE_TTL = 30;
const FETCH_TIMEOUT = 10_000;

const PULSEX_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex-v2';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';

const VALID_CHAINS = new Set(['pulsechain', 'ethereum', 'base']);

async function fetchPulseXPrices(tokenAddresses: string[]): Promise<Record<string, number>> {
  if (tokenAddresses.length === 0) return {};
  const ids = tokenAddresses.join('", "');
  const query = `{ tokens(where: { id_in: ["${ids}"] }) { id derivedUSD } }`;
  const res = await fetch(PULSEX_SUBGRAPH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) return {};
  const json = await res.json() as { data?: { tokens?: Array<{ id: string; derivedUSD: string }> } };
  const result: Record<string, number> = {};
  for (const token of json.data?.tokens ?? []) {
    const price = parseFloat(token.derivedUSD);
    if (price > 0) result[token.id.toLowerCase()] = price;
  }
  return result;
}

async function fetchCoinGeckoPrices(coinGeckoIds: string[]): Promise<Record<string, number>> {
  if (coinGeckoIds.length === 0) return {};
  const res = await fetch(
    `${COINGECKO_URL}?ids=${coinGeckoIds.join(',')}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
  );
  if (!res.ok) return {};
  const json = await res.json() as Record<string, { usd?: number }>;
  const result: Record<string, number> = {};
  for (const [id, val] of Object.entries(json)) {
    if (typeof val.usd === 'number' && val.usd > 0) result[id] = val.usd;
  }
  return result;
}

// GET /api/v1/prices?chain=pulsechain&tokens=0xabc,0xdef
router.get('/', async (req, res) => {
  const chain = req.query.chain as string;
  const tokensParam = req.query.tokens as string;

  if (!chain || !VALID_CHAINS.has(chain)) {
    res.status(400).json({
      ok: false,
      error: 'INVALID_CHAIN',
      message: `chain must be one of: ${[...VALID_CHAINS].join(', ')}`,
    });
    return;
  }

  if (!tokensParam) {
    res.status(400).json({
      ok: false,
      error: 'MISSING_TOKENS',
      message: 'tokens query param is required (comma-separated addresses)',
    });
    return;
  }

  const tokenAddresses = tokensParam
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  if (tokenAddresses.length === 0) {
    res.json({ ok: true, data: { chain, prices: {} }, cachedAt: Math.floor(Date.now() / 1000), ttlRemaining: PRICE_TTL });
    return;
  }

  const cacheKey = `prices:${chain}:${[...tokenAddresses].sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json({ ok: true, ...cached });
    return;
  }

  const prices: Record<string, number> = {};

  try {
    if (chain === 'pulsechain') {
      const subgraphPrices = await fetchPulseXPrices(tokenAddresses);
      Object.assign(prices, subgraphPrices);
    } else {
      const chainTokens = TOKENS[chain as 'ethereum' | 'base'] ?? [];
      const matched = chainTokens.filter(t => tokenAddresses.includes(t.address.toLowerCase()));
      const coinGeckoIds = [...new Set(matched.map(t => t.coinGeckoId))];
      const cgPrices = await fetchCoinGeckoPrices(coinGeckoIds);
      for (const token of matched) {
        const price = cgPrices[token.coinGeckoId];
        if (price) prices[token.address.toLowerCase()] = price;
      }
    }
  } catch {
    // Return empty prices; caller falls back to direct chain calls
  }

  // Persist to DB (best-effort)
  const source = chain === 'pulsechain' ? 'pulsex' : 'coingecko';
  for (const [addr, price] of Object.entries(prices)) {
    try {
      upsertPrice(chain, addr, price, source);
    } catch {
      // Non-fatal
    }
  }

  const data = { chain, prices };
  setCached(cacheKey, data, PRICE_TTL);
  const cachedAt = Math.floor(Date.now() / 1000);
  res.json({ ok: true, data, cachedAt, ttlRemaining: PRICE_TTL });
});

export default router;
