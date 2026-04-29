/**
 * fetchBenchmarkPrices
 * --------------------
 * Fetches 365 days of daily close prices for PLS and ETH to build a real
 * benchmark for the Wallet Analyzer performance chart.
 *
 * PLS prices  — PulseX subgraph: WPLS/USDC pair daily TWAPs
 * ETH prices  — CoinGecko /coins/ethereum/market_chart (no API key needed for
 *               this endpoint with basic usage)
 *
 * Both series are aligned to UTC midnight timestamps and returned as simple
 * `{ timestamp: number; price: number }[]` arrays.
 *
 * Results are cached in-memory for 5 minutes so multiple callers in the same
 * session don't redundantly re-fetch.
 */

export interface PricePoint {
  timestamp: number;
  price: number;
}

const PULSEX_V2_SUBGRAPH =
  'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex-v2';

// WPLS/USDC pair address on PulseX v2
const WPLS_USDC_PAIR = '0xe56043671df55de5cdf8459710433c10324de0ae';

const COINGECKO_ETH_URL =
  'https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=365&interval=daily';

const CACHE_TTL_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let plsCache: { expiresAt: number; data: PricePoint[] } | null = null;
let ethCache: { expiresAt: number; data: PricePoint[] } | null = null;

// ---------------------------------------------------------------------------
// PLS prices via PulseX subgraph
// ---------------------------------------------------------------------------

interface PairDayData {
  date: number;     // unix epoch (seconds)
  token0Price: string; // USDC per WPLS
  token1Price: string; // WPLS per USDC
}

async function fetchPlsPrices(): Promise<PricePoint[]> {
  if (plsCache && plsCache.expiresAt > Date.now()) {
    return plsCache.data;
  }

  const query = `{
    pairDayDatas(
      first: 365
      orderBy: date
      orderDirection: desc
      where: { pairAddress: "${WPLS_USDC_PAIR}" }
    ) {
      date
      token0Price
      token1Price
    }
  }`;

  const res = await fetch(PULSEX_V2_SUBGRAPH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`PulseX subgraph request failed: ${res.status}`);
  }

  const json = await res.json() as { data?: { pairDayDatas?: PairDayData[] } };
  const days = json.data?.pairDayDatas ?? [];

  // token0 is USDC (6 dec), token1 is WPLS (18 dec)
  // token0Price = WPLS per USDC → invert for USD per PLS
  const data: PricePoint[] = days
    .map(d => {
      const wplsPerUsdc = parseFloat(d.token0Price);
      const usdPerPls = wplsPerUsdc > 0 ? 1 / wplsPerUsdc : 0;
      return { timestamp: d.date * 1000, price: usdPerPls };
    })
    .filter(p => p.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  plsCache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
  return data;
}

// ---------------------------------------------------------------------------
// ETH prices via CoinGecko
// ---------------------------------------------------------------------------

async function fetchEthPrices(): Promise<PricePoint[]> {
  if (ethCache && ethCache.expiresAt > Date.now()) {
    return ethCache.data;
  }

  const res = await fetch(COINGECKO_ETH_URL, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko ETH market_chart request failed: ${res.status}`);
  }

  const json = await res.json() as { prices?: [number, number][] };
  const raw = json.prices ?? [];

  const data: PricePoint[] = raw
    .map(([ts, price]) => ({ timestamp: ts, price }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  ethCache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BenchmarkPrices {
  pls: PricePoint[];
  eth: PricePoint[];
}

/**
 * Fetch both PLS and ETH price series concurrently.
 * Each series that fails individually returns an empty array so the caller can
 * degrade gracefully.
 */
export async function fetchBenchmarkPrices(): Promise<BenchmarkPrices> {
  const [plsResult, ethResult] = await Promise.allSettled([
    fetchPlsPrices(),
    fetchEthPrices(),
  ]);

  return {
    pls: plsResult.status === 'fulfilled' ? plsResult.value : [],
    eth: ethResult.status === 'fulfilled' ? ethResult.value : [],
  };
}
