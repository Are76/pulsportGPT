import { Router } from 'express';
import { validateAddress } from '../middleware/validate';
import { getCached, setCached } from '../middleware/cache';

const router = Router();

const LP_TTL = 60;
const FETCH_TIMEOUT = 15_000;

const PULSEX_SUBGRAPH = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex-v2';

interface LpPosition {
  pairAddress: string;
  pairName: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Amount: number;
  token1Amount: number;
  totalUsd: number;
  lpBalance: number;
  ownershipPct: number;
  isStaked: boolean;
}

async function fetchLpPositions(address: string): Promise<LpPosition[]> {
  const query = `{
    liquidityPositions(where: { user: "${address.toLowerCase()}", liquidityTokenBalance_gt: "0" }) {
      id
      liquidityTokenBalance
      pair {
        id
        reserveUSD
        totalSupply
        token0 { id symbol decimals }
        token1 { id symbol decimals }
        reserve0
        reserve1
      }
    }
  }`;

  const res = await fetch(PULSEX_SUBGRAPH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) return [];

  const json = await res.json() as {
    data?: {
      liquidityPositions?: Array<{
        id: string;
        liquidityTokenBalance: string;
        pair: {
          id: string;
          reserveUSD: string;
          totalSupply: string;
          token0: { id: string; symbol: string; decimals: string };
          token1: { id: string; symbol: string; decimals: string };
          reserve0: string;
          reserve1: string;
        };
      }>;
    };
  };

  const positions = json.data?.liquidityPositions ?? [];
  const result: LpPosition[] = [];

  for (const pos of positions) {
    const { pair } = pos;
    const lpBalance = parseFloat(pos.liquidityTokenBalance);
    const totalSupply = parseFloat(pair.totalSupply);
    const ownershipPct = totalSupply > 0 ? lpBalance / totalSupply : 0;
    const totalUsd = parseFloat(pair.reserveUSD) * ownershipPct;
    const reserve0 = parseFloat(pair.reserve0);
    const reserve1 = parseFloat(pair.reserve1);

    result.push({
      pairAddress: pair.id.toLowerCase(),
      pairName: `${pair.token0.symbol}/${pair.token1.symbol}`,
      token0Symbol: pair.token0.symbol,
      token1Symbol: pair.token1.symbol,
      token0Amount: reserve0 * ownershipPct,
      token1Amount: reserve1 * ownershipPct,
      totalUsd,
      lpBalance,
      ownershipPct,
      isStaked: false,
    });
  }

  return result;
}

async function fetchFarmedPositions(address: string): Promise<Array<{ pairAddress: string; stakedLp: string }>> {
  // Query MasterChef poolLength and userInfo via batch RPC
  const farmQuery = `{
    users(where: { address: "${address.toLowerCase()}" }) {
      amount
      pool { id pair { id token0 { symbol } token1 { symbol } } }
    }
  }`;

  const subgraphFarm = 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex-masterchef';
  try {
    const res = await fetch(subgraphFarm, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: farmQuery }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { users?: Array<{ amount: string; pool: { pair: { id: string } } }> } };
    return (json.data?.users ?? [])
      .filter(u => parseFloat(u.amount) > 0)
      .map(u => ({ pairAddress: u.pool.pair.id.toLowerCase(), stakedLp: u.amount }));
  } catch {
    return [];
  }
}

// GET /api/v1/lp/:address
router.get('/:address', validateAddress(), async (req, res) => {
  const { address } = req.params;

  const cacheKey = `lp:${address}`;
  const memCached = getCached(cacheKey);
  if (memCached) {
    res.json({ ok: true, ...memCached });
    return;
  }

  try {
    const [positions, farmed] = await Promise.all([
      fetchLpPositions(address),
      fetchFarmedPositions(address),
    ]);

    // Merge staked status
    const farmedMap = new Map(farmed.map(f => [f.pairAddress, parseFloat(f.stakedLp)]));
    for (const pos of positions) {
      if (farmedMap.has(pos.pairAddress)) {
        pos.isStaked = true;
      }
    }

    const data = { address, positions };
    setCached(cacheKey, data, LP_TTL);
    const cachedAt = Math.floor(Date.now() / 1000);
    res.json({ ok: true, data, cachedAt, ttlRemaining: LP_TTL });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: 'UPSTREAM_ERROR',
      message: err instanceof Error ? err.message : 'Failed to fetch LP positions',
    });
  }
});

export default router;
