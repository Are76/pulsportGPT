import type { Asset } from '../../types';

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

  await Promise.allSettled(pulseAssetsMissingPrice.map(async (asset) => {
    const rawAddress = (asset as any).address?.toLowerCase?.();
    if (!rawAddress) return;

    try {
      const response = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${rawAddress}`);
      if (!response.ok) return;

      const data = await response.json();
      const pairs: any[] = (data.pairs || []).filter((pair: any) =>
        pair?.chainId === 'pulsechain'
        && (
          pair?.baseToken?.address?.toLowerCase?.() === rawAddress
          || pair?.quoteToken?.address?.toLowerCase?.() === rawAddress
        ),
      );
      if (pairs.length === 0) return;

      const bestPair = [...pairs].sort((left, right) =>
        Number(right?.liquidity?.usd ?? 0) - Number(left?.liquidity?.usd ?? 0),
      )[0];
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
    } catch {
      /* ignore */
    }
  }));

  return fallbackLogos;
}
