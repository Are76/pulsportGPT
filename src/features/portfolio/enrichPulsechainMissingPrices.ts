import type { Asset } from '../../types';
import { fetchDexScreenerBatchTokenPairs } from '../../services/marketDataService';

type FetchLike = typeof fetch;
type AssetMap = Record<string, Asset>;
type WalletAssetMap = Record<string, Record<string, Asset>>;

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

  const fallbackLogos: Record<string, string> = {};
  const assetsByAddress = new Map(
    pulseAssetsMissingPrice.map((asset) => [String((asset as any).address).toLowerCase(), asset]),
  );
  const addresses = [...assetsByAddress.keys()];
  const chunks: string[][] = [];

  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  await Promise.allSettled(chunks.map(async (chunk) => {
    const pairs = await fetchDexScreenerBatchTokenPairs('pulsechain', chunk, fetchImpl);
    const bestPairs = new Map<string, any>();

    pairs.forEach((pair: any) => {
      const baseAddress = pair?.baseToken?.address?.toLowerCase?.();
      const quoteAddress = pair?.quoteToken?.address?.toLowerCase?.();
      const matchedAddress = assetsByAddress.has(baseAddress)
        ? baseAddress
        : assetsByAddress.has(quoteAddress)
          ? quoteAddress
          : null;

      if (!matchedAddress || pair?.chainId !== 'pulsechain') {
        return;
      }

      const current = bestPairs.get(matchedAddress);
      const currentLiquidity = Number(current?.liquidity?.usd ?? 0);
      const nextLiquidity = Number(pair?.liquidity?.usd ?? 0);
      if (!current || nextLiquidity > currentLiquidity) {
        bestPairs.set(matchedAddress, pair);
      }
    });

    bestPairs.forEach((bestPair, rawAddress) => {
      const asset = assetsByAddress.get(rawAddress);
      if (!asset) return;

      const matchedBase = bestPair?.baseToken?.address?.toLowerCase?.() === rawAddress;
      const pairToken = matchedBase ? bestPair?.baseToken : bestPair?.quoteToken;
      const price = Number(bestPair?.priceUsd ?? 0);
      if (!(price > 0)) return;

      assetMap[asset.id] = {
        ...assetMap[asset.id],
        symbol: pairToken?.symbol || assetMap[asset.id].symbol,
        name: pairToken?.name || assetMap[asset.id].name,
        price,
        value: assetMap[asset.id].balance * price,
        priceChange24h: Number(bestPair?.priceChange?.h24 ?? assetMap[asset.id].priceChange24h ?? 0),
        priceChange1h: Number(bestPair?.priceChange?.h1 ?? assetMap[asset.id].priceChange1h ?? 0),
        pnl24h: Number(bestPair?.priceChange?.h24 ?? assetMap[asset.id].pnl24h ?? 0),
      };

      if (bestPair?.info?.imageUrl) {
        fallbackLogos[rawAddress] = bestPair.info.imageUrl;
        (assetMap[asset.id] as any).logoUrl = bestPair.info.imageUrl;
      }

      Object.values(walletAssetMap).forEach((walletMap) => {
        const walletAsset = walletMap[asset.id];
        if (!walletAsset) return;

        walletMap[asset.id] = {
          ...walletAsset,
          symbol: pairToken?.symbol || walletAsset.symbol,
          name: pairToken?.name || walletAsset.name,
          price,
          value: walletAsset.balance * price,
          priceChange24h: Number(bestPair?.priceChange?.h24 ?? walletAsset.priceChange24h ?? 0),
          priceChange1h: Number(bestPair?.priceChange?.h1 ?? walletAsset.priceChange1h ?? 0),
          pnl24h: Number(bestPair?.priceChange?.h24 ?? walletAsset.pnl24h ?? 0),
          ...(bestPair?.info?.imageUrl ? { logoUrl: bestPair.info.imageUrl } : {}),
        } as Asset;
      });
    });
  }));

  return fallbackLogos;
}
