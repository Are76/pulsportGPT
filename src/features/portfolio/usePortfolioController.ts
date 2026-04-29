/**
 * usePortfolioController
 * ----------------------
 * Pure derivation hook — composes buildPortfolioSnapshot from the outputs of
 * usePriceController, useBalanceController, and useTransactionController.
 * Does NOT perform any I/O.
 *
 * Exposes:
 *   - `snapshot`     — the current PortfolioSnapshot (realAssets, realStakes,
 *                       walletAssets, processedTransactions, history)
 *   - `lastUpdated`  — Unix ms timestamp of the last successful snapshot
 */

import { useMemo, useState } from 'react';
import type { Asset, FarmPosition, HexStake, HistoryPoint, LpPosition, Transaction, Wallet } from '../../types';
import { buildPortfolioSnapshot, type PortfolioSnapshot } from './buildPortfolioSnapshot';

export interface PortfolioControllerInputs {
  wallets: Wallet[];
  prices: Record<string, any>;
  assets: Asset[];
  walletAssets: Record<string, Asset[]>;
  stakes: HexStake[];
  transactions: Transaction[];
  lpPositions: LpPosition[];
  farmPositions: FarmPosition[];
  previousHistory: HistoryPoint[];
  previousStakes: HexStake[];
}

export interface PortfolioController {
  snapshot: PortfolioSnapshot;
  lastUpdated: number | null;
}

const EMPTY_SNAPSHOT: PortfolioSnapshot = {
  realAssets: [],
  realStakes: [],
  walletAssets: {},
  processedTransactions: [],
  history: [],
};

export function usePortfolioController({
  wallets,
  prices,
  assets,
  walletAssets,
  stakes,
  transactions,
  previousHistory,
  previousStakes,
}: PortfolioControllerInputs): PortfolioController {
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const snapshot = useMemo(() => {
    if (assets.length === 0 && transactions.length === 0) {
      return EMPTY_SNAPSHOT;
    }

    // Build assetMap from current assets
    const assetMap: Record<string, Asset> = {};
    assets.forEach((asset) => {
      assetMap[asset.id] = { ...asset };
    });

    // Build walletAssetMap
    const walletAssetMap: Record<string, Record<string, Asset>> = {};
    Object.entries(walletAssets).forEach(([addr, assetList]) => {
      walletAssetMap[addr] = {};
      assetList.forEach((asset) => {
        walletAssetMap[addr][asset.id] = { ...asset };
      });
    });

    const snap = buildPortfolioSnapshot({
      assetMap,
      walletAssetMap,
      allStakes: stakes,
      allTransactions: transactions,
      fetchedPrices: prices,
      wallets,
      previousHistory,
      previousRealStakes: previousStakes,
    });

    // Side-effect: record timestamp when snapshot is non-trivial
    if (snap.realAssets.length > 0) {
      setLastUpdated(Date.now());
    }

    return snap;
  }, [assets, walletAssets, stakes, transactions, prices, wallets, previousHistory, previousStakes]);

  return { snapshot, lastUpdated };
}
