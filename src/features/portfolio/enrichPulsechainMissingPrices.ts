import type { Asset } from '../../types';

type FetchLike = typeof fetch;
type AssetMap = Record<string, Asset>;
type WalletAssetMap = Record<string, Record<string, Asset>>;

const DEXSCREENER_CHUNK_SIZE = 30;

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export async function enrichPulsechainMissingPrices(
  assetMap: AssetMap,
  walletAssetMap: WalletAssetMap,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, string>> {
  const pulseAssetsMissingPrice = Object.values(assetMap).filter((asset) =>
    asset.chain === 'pulsechain'
    && asset.balance > 0
    && asset.price === 0
    && (asset as any).address
    && (asset as any).address !== 'native',
  );

  if (pulseAssetsMissingPrice.length === 0) {
    return {};
  }

  // Build a lookup from address → asset so we can apply results below.
  const assetByAddress = new Map<string, Asset>(
    pulseAssetsMissingPrice.map((a) => [(a as any).address.toLowerCase(), a]),
  );

  // One bestPair per token address, selected by highest liquidity USD.
  const bestPairs = new Map<string, any>();

  await Promise.allSettled(
    chunks([...assetByAddress.keys()], DEXSCREENER_CHUNK_SIZE).map(async (chunk) => {
      try {
        const response = await fetchImpl(
          `https://api.dexscreener.com/tokens/v1/pulsechain/${chunk.join(',')}`,
        );
        if (!response.ok) return;

        const pairs = await response.json();
        if (!Array.isArray(pairs)) return;

        for (const pair of pairs) {
          const baseAddr = pair?.baseToken?.address?.toLowerCase?.();
          const quoteAddr = pair?.quoteToken?.address?.toLowerCase?.();
          const matchedAddr = assetByAddress.has(baseAddr)
            ? baseAddr
            : assetByAddress.has(quoteAddr)
              ? quoteAddr
              : null;
          if (!matchedAddr) continue;

          const current = bestPairs.get(matchedAddr);
          const currentLiq = Number(current?.liquidity?.usd ?? 0);
          const nextLiq = Number(pair?.liquidity?.usd ?? 0);
          if (!current || nextLiq > currentLiq) {
            bestPairs.set(matchedAddr, pair);
          }
        }
      } catch {
        /* individual chunk failure is non-fatal */
      }
    }),
  );

  const fallbackLogos: Record<string, string> = {};

  bestPairs.forEach((pair, rawAddress) => {
    const asset = assetByAddress.get(rawAddress);
    if (!asset) return;

    const price = Number(pair?.priceUsd ?? 0);
    if (!(price > 0)) return;

    const baseAddr = pair?.baseToken?.address?.toLowerCase?.();
    const pairToken = baseAddr === rawAddress ? pair?.baseToken : pair?.quoteToken;

    const updatedFields = {
      symbol: pairToken?.symbol || asset.symbol,
      name: pairToken?.name || asset.name,
      price,
      value: asset.balance * price,
      priceChange24h: Number(pair?.priceChange?.h24 ?? asset.priceChange24h ?? 0),
      priceChange1h: Number(pair?.priceChange?.h1 ?? asset.priceChange1h ?? 0),
      pnl24h: Number(pair?.priceChange?.h24 ?? asset.pnl24h ?? 0),
      ...(pair?.info?.imageUrl ? { logoUrl: pair.info.imageUrl } : {}),
    };

    assetMap[asset.id] = { ...assetMap[asset.id], ...updatedFields };

    if (pair?.info?.imageUrl) {
      fallbackLogos[rawAddress] = pair.info.imageUrl;
    }

    Object.values(walletAssetMap).forEach((walletMap) => {
      const walletAsset = walletMap[asset.id];
      if (!walletAsset) return;
      walletMap[asset.id] = {
        ...walletAsset,
        ...updatedFields,
        value: walletAsset.balance * price,
      } as Asset;
    });
  });

  return fallbackLogos;
}
