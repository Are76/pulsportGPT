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
const FETCH_TIMEOUT = 10_000;

const SUBGRAPH_URLS = {
  v1: 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex',
  v2: 'https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex-v2',
} as const;

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
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT)]) : AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!response.ok) {
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
