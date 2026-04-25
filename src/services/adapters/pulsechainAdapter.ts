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
