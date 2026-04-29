import { normalizeTransactions } from '../../utils/normalizeTransactions';
import type { Asset, Chain, HexStake, HistoryPoint, Transaction, Wallet } from '../../types';

type AssetMap = Record<string, Asset>;
type WalletAssetMap = Record<string, Record<string, Asset>>;
type PriceMap = Record<string, { usd?: number } | undefined>;

type BuildPortfolioSnapshotArgs = {
  assetMap: AssetMap;
  walletAssetMap: WalletAssetMap;
  allStakes: HexStake[];
  allTransactions: Transaction[];
  fetchedPrices: PriceMap;
  wallets: Wallet[];
  previousHistory: HistoryPoint[];
  previousRealStakes: HexStake[];
  now?: number;
};

export type PortfolioSnapshot = {
  realAssets: Asset[];
  realStakes: HexStake[];
  walletAssets: Record<string, Asset[]>;
  processedTransactions: Transaction[];
  history: HistoryPoint[];
};

function aggregateActiveStakesIntoAssets(assetMap: AssetMap, allStakes: HexStake[]) {
  allStakes
    .filter((stake) => (stake.daysRemaining ?? 0) > 0)
    .forEach((stake) => {
      const assetKey = `${stake.chain}-HEX`;
      const asset = assetMap[assetKey];
      if (!asset) return;

      const stakedHeartsNum = Number(stake.stakedHearts) / 1e8;
      const interestHeartsNum = Number(stake.interestHearts || 0n) / 1e8;
      const totalHeartsNum = stakedHeartsNum + interestHeartsNum;

      asset.stakedBalance = (asset.stakedBalance || 0) + totalHeartsNum;
      asset.stakedValue = (asset.stakedValue || 0) + (stake.totalValueUsd || stake.estimatedValueUsd);
    });
}

function mergeWplsIntoPls(assetMap: AssetMap) {
  const wplsEntry = assetMap['pulsechain-WPLS'];
  if (!wplsEntry) return;

  const plsEntry = assetMap['pulsechain-PLS'];
  if (plsEntry) {
    plsEntry.balance += wplsEntry.balance;
    plsEntry.value += wplsEntry.value;
  } else {
    assetMap['pulsechain-PLS'] = { ...wplsEntry, id: 'pulsechain-PLS', symbol: 'PLS' };
  }

  delete assetMap['pulsechain-WPLS'];
}

function buildRealStakes(allStakes: HexStake[], previousRealStakes: HexStake[], wallets: Wallet[]) {
  if (allStakes.length > 0) return allStakes;
  if (wallets.length === 0) return allStakes;

  const walletSet = new Set(wallets.map((wallet) => wallet.address.toLowerCase()));
  const cachedForCurrentWallets = previousRealStakes.filter((stake) =>
    walletSet.has((stake.walletAddress || '').toLowerCase()),
  );
  return cachedForCurrentWallets.length > 0 ? cachedForCurrentWallets : allStakes;
}

function buildWalletAssets(walletAssetMap: WalletAssetMap) {
  const walletAssets: Record<string, Asset[]> = {};
  Object.entries(walletAssetMap).forEach(([address, assetById]) => {
    walletAssets[address] = Object.values(assetById).sort((a, b) => b.value - a.value);
  });
  return walletAssets;
}

function buildHistory(
  realAssets: Asset[],
  previousHistory: HistoryPoint[],
  fetchedPrices: PriceMap,
  now: number,
) {
  const totalValue = realAssets.reduce((sum, asset) => sum + asset.value, 0);
  const plsPrice = fetchedPrices.pulsechain?.usd || 0.00005;
  const nativeValue = totalValue / plsPrice;
  const chainPnl: Record<Chain, number> = { pulsechain: 0, ethereum: 0, base: 0 };

  realAssets.forEach((asset) => {
    chainPnl[asset.chain] += (asset.value * (asset.pnl24h || 0)) / 100;
  });

  const lastPoint = previousHistory[previousHistory.length - 1];
  const pnl = lastPoint ? totalValue - lastPoint.value : 0;
  const historyPoint: HistoryPoint = {
    timestamp: now,
    value: totalValue,
    nativeValue,
    pnl,
    chainPnl,
  };

  return [...previousHistory.slice(-99), historyPoint];
}

export function buildPortfolioSnapshot({
  assetMap,
  walletAssetMap,
  allStakes,
  allTransactions,
  fetchedPrices,
  wallets,
  previousHistory,
  previousRealStakes,
  now = Date.now(),
}: BuildPortfolioSnapshotArgs): PortfolioSnapshot {
  aggregateActiveStakesIntoAssets(assetMap, allStakes);
  mergeWplsIntoPls(assetMap);

  const realAssets = Object.values(assetMap).sort((a, b) => b.value - a.value);
  const realStakes = buildRealStakes(allStakes, previousRealStakes, wallets);
  const walletAssets = buildWalletAssets(walletAssetMap);
  const walletAddrs = new Set<string>(wallets.map((wallet) => wallet.address.toLowerCase()));
  const processedTransactions = normalizeTransactions(allTransactions, walletAddrs);
  const history = buildHistory(realAssets, previousHistory, fetchedPrices, now);

  return {
    realAssets,
    realStakes,
    walletAssets,
    processedTransactions,
    history,
  };
}
