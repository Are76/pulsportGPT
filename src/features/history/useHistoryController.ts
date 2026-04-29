import { useCallback, useMemo, useState } from 'react';
import type { Asset, Chain, Transaction } from '../../types';
import {
  DEFAULT_HISTORY_FILTER_STATE,
  matchesHistoryTransactionType,
  resolveHistoryFilterState,
  type HistoryBridgeProtocolFilter,
  type HistoryDrilldownIntent,
  type HistoryFilterState,
  type HistoryStakingActionFilter,
  type HistoryTransactionTypeFilter,
} from './historyDrilldown';

interface UseHistoryControllerArgs {
  currentAssets: Asset[];
  currentTransactions: Transaction[];
  selectedWalletAddr: string;
  prices: Record<string, { usd?: number } | undefined>;
  matchesAssetSymbol: (left: string, right: string, chain?: string) => boolean;
}

interface HistorySummary {
  swapCount: number;
  gasPls: number;
  gasUsd: number;
  tokenTxs: Transaction[];
  realizedPnl: number;
  holdingsValue: number;
}

export interface HistoryController {
  txTypeFilter: string;
  setTxTypeFilter: (value: string) => void;
  txAssetFilter: string;
  setTxAssetFilter: (value: string) => void;
  txYearFilter: string;
  setTxYearFilter: (value: string) => void;
  txCoinCategory: string;
  setTxCoinCategory: (value: string) => void;
  txChainFilter: 'all' | Chain;
  setTxChainFilter: (value: 'all' | Chain) => void;
  txBridgeProtocolFilter: HistoryBridgeProtocolFilter;
  setTxBridgeProtocolFilter: (value: HistoryBridgeProtocolFilter) => void;
  txOriginChainFilter: 'all' | Chain;
  setTxOriginChainFilter: (value: 'all' | Chain) => void;
  txStakingActionFilter: HistoryStakingActionFilter;
  setTxStakingActionFilter: (value: HistoryStakingActionFilter) => void;
  filteredTransactions: Transaction[];
  holdingsPulsechainTransactions: Transaction[];
  swapAssetFilterOptions: [string, string][];
  swapYearFilterOptions: [string, string][];
  hasActiveSwapFilters: boolean;
  activeHistoryAsset?: Asset;
  historySummary: HistorySummary;
  resetHistoryFilters: () => void;
  applyHistoryDrilldownIntent: (intent: HistoryDrilldownIntent) => void;
}

export function useHistoryController({
  currentAssets,
  currentTransactions,
  selectedWalletAddr,
  prices,
  matchesAssetSymbol,
}: UseHistoryControllerArgs): HistoryController {
  const [txTypeFilter, setTxTypeFilterState] = useState<string>(DEFAULT_HISTORY_FILTER_STATE.txTypeFilter);
  const [txAssetFilter, setTxAssetFilterState] = useState<string>(DEFAULT_HISTORY_FILTER_STATE.txAssetFilter);
  const [txYearFilter, setTxYearFilterState] = useState<string>(DEFAULT_HISTORY_FILTER_STATE.txYearFilter);
  const [txCoinCategory, setTxCoinCategoryState] = useState<string>(DEFAULT_HISTORY_FILTER_STATE.txCoinCategory);
  const [txChainFilter, setTxChainFilterState] = useState<'all' | Chain>(DEFAULT_HISTORY_FILTER_STATE.txChainFilter);
  const [txBridgeProtocolFilter, setTxBridgeProtocolFilterState] = useState<HistoryBridgeProtocolFilter>(DEFAULT_HISTORY_FILTER_STATE.txBridgeProtocolFilter);
  const [txOriginChainFilter, setTxOriginChainFilterState] = useState<'all' | Chain>(DEFAULT_HISTORY_FILTER_STATE.txOriginChainFilter);
  const [txStakingActionFilter, setTxStakingActionFilterState] = useState<HistoryStakingActionFilter>(DEFAULT_HISTORY_FILTER_STATE.txStakingActionFilter);

  const setTxTypeFilter = useCallback((value: string) => {
    setTxTypeFilterState(value);
  }, []);

  const setTxAssetFilter = useCallback((value: string) => {
    setTxAssetFilterState(value);
  }, []);

  const setTxYearFilter = useCallback((value: string) => {
    setTxYearFilterState(value);
  }, []);

  const setTxCoinCategory = useCallback((value: string) => {
    setTxCoinCategoryState(value);
  }, []);

  const setTxChainFilter = useCallback((value: 'all' | Chain) => {
    setTxChainFilterState(value);
  }, []);

  const setTxBridgeProtocolFilter = useCallback((value: HistoryBridgeProtocolFilter) => {
    setTxBridgeProtocolFilterState(value);
  }, []);

  const setTxOriginChainFilter = useCallback((value: 'all' | Chain) => {
    setTxOriginChainFilterState(value);
  }, []);

  const setTxStakingActionFilter = useCallback((value: HistoryStakingActionFilter) => {
    setTxStakingActionFilterState(value);
  }, []);

  const resetHistoryFilters = useCallback(() => {
    setTxTypeFilterState(DEFAULT_HISTORY_FILTER_STATE.txTypeFilter);
    setTxAssetFilterState(DEFAULT_HISTORY_FILTER_STATE.txAssetFilter);
    setTxYearFilterState(DEFAULT_HISTORY_FILTER_STATE.txYearFilter);
    setTxCoinCategoryState(DEFAULT_HISTORY_FILTER_STATE.txCoinCategory);
    setTxChainFilterState(DEFAULT_HISTORY_FILTER_STATE.txChainFilter);
    setTxBridgeProtocolFilterState(DEFAULT_HISTORY_FILTER_STATE.txBridgeProtocolFilter);
    setTxOriginChainFilterState(DEFAULT_HISTORY_FILTER_STATE.txOriginChainFilter);
    setTxStakingActionFilterState(DEFAULT_HISTORY_FILTER_STATE.txStakingActionFilter);
  }, []);

  const applyHistoryDrilldownIntent = useCallback((intent: HistoryDrilldownIntent) => {
    const next: HistoryFilterState = resolveHistoryFilterState(intent);
    setTxTypeFilterState(next.txTypeFilter);
    setTxAssetFilterState(next.txAssetFilter);
    setTxYearFilterState(next.txYearFilter);
    setTxCoinCategoryState(next.txCoinCategory);
    setTxChainFilterState(next.txChainFilter);
    setTxBridgeProtocolFilterState(next.txBridgeProtocolFilter);
    setTxOriginChainFilterState(next.txOriginChainFilter);
    setTxStakingActionFilterState(next.txStakingActionFilter);
  }, []);

  const matchesHistoryTransactionFilters = useCallback((tx: Transaction) => {
    const walletKey = selectedWalletAddr.toLowerCase();
    const matchesWallet = walletKey === 'all'
      || tx.from?.toLowerCase() === walletKey
      || tx.to?.toLowerCase() === walletKey
      || (tx as any).walletAddress?.toLowerCase?.() === walletKey;
    const matchesChain = txChainFilter === 'all' || tx.chain === txChainFilter;
    const matchesAsset = txAssetFilter === 'all'
      || matchesAssetSymbol(tx.asset, txAssetFilter, tx.chain)
      || matchesAssetSymbol(tx.counterAsset ?? '', txAssetFilter, tx.chain);
    const txYear = new Date(tx.timestamp).getFullYear().toString();
    const matchesYear = txYearFilter === 'all' || txYear === txYearFilter;
    const matchesBridgeProtocol = txBridgeProtocolFilter === 'all' || tx.bridge?.protocol === txBridgeProtocolFilter;
    const matchesOriginChain = txOriginChainFilter === 'all' || tx.bridge?.originChain === txOriginChainFilter;
    const matchesStakingAction = txStakingActionFilter === 'all' || tx.staking?.action === txStakingActionFilter;
    const assetUpper = tx.asset.toUpperCase();
    let matchesCoin = true;
    if (txCoinCategory === 'stablecoins') {
      matchesCoin = assetUpper.includes('USDC') || assetUpper.includes('USDT') || assetUpper.includes('DAI')
        || assetUpper.includes('TETHER') || assetUpper.includes('USD COIN') || assetUpper.includes('USDBC');
    } else if (txCoinCategory === 'eth_weth') {
      matchesCoin = assetUpper === 'ETH' || assetUpper === 'WETH';
    } else if (txCoinCategory === 'hex') {
      matchesCoin = assetUpper === 'HEX' || assetUpper === 'EHEX' || assetUpper.includes('HEX');
    } else if (txCoinCategory === 'pls_wpls') {
      matchesCoin = assetUpper === 'PLS' || assetUpper === 'WPLS';
    } else if (txCoinCategory === 'bridged') {
      matchesCoin = !!tx.bridged;
    }
    return matchesWallet
      && matchesChain
      && matchesAsset
      && matchesYear
      && matchesBridgeProtocol
      && matchesOriginChain
      && matchesStakingAction
      && matchesCoin;
  }, [
    matchesAssetSymbol,
    selectedWalletAddr,
    txAssetFilter,
    txBridgeProtocolFilter,
    txChainFilter,
    txCoinCategory,
    txOriginChainFilter,
    txStakingActionFilter,
    txYearFilter,
  ]);

  const normalizedTxTypeFilter = txTypeFilter as HistoryTransactionTypeFilter;

  const filteredTransactions = useMemo(() => {
    return currentTransactions.filter((tx) =>
      matchesHistoryTransactionFilters(tx) && matchesHistoryTransactionType(tx, normalizedTxTypeFilter),
    );
  }, [currentTransactions, matchesHistoryTransactionFilters, normalizedTxTypeFilter]);

  const holdingsPulsechainTransactions = useMemo(() => {
    return currentTransactions.filter((tx) =>
      matchesHistoryTransactionFilters(tx) && matchesHistoryTransactionType(tx, normalizedTxTypeFilter),
    );
  }, [currentTransactions, matchesHistoryTransactionFilters, normalizedTxTypeFilter]);

  const swapAssetFilterOptions = useMemo<[string, string][]>(() => {
    const symbols = Array.from(new Set<string>(
      currentTransactions
        .flatMap((tx) => [tx.asset, tx.counterAsset].filter(Boolean) as string[]),
    )).sort((a, b) => a.localeCompare(b));
    return [['all', 'All Tokens'], ...symbols.map((symbol) => [symbol, symbol] as [string, string])];
  }, [currentTransactions]);

  const swapYearFilterOptions = useMemo<[string, string][]>(() => {
    const years = Array.from(new Set(
      currentTransactions
        .map((tx) => new Date(tx.timestamp).getFullYear().toString()),
    )).sort((a, b) => Number(b) - Number(a));
    return [['all', 'All Years'], ...years.map((year) => [year, year] as [string, string])];
  }, [currentTransactions]);

  const hasActiveSwapFilters = txAssetFilter !== 'all'
    || txYearFilter !== 'all'
    || txCoinCategory !== 'all'
    || txChainFilter !== DEFAULT_HISTORY_FILTER_STATE.txChainFilter
    || txBridgeProtocolFilter !== 'all'
    || txOriginChainFilter !== 'all'
    || txStakingActionFilter !== 'all';

  const activeHistoryAsset = useMemo(() => {
    if (txAssetFilter === 'all') return undefined;
    return currentAssets.find((asset) => matchesAssetSymbol(asset.symbol, txAssetFilter, asset.chain));
  }, [currentAssets, matchesAssetSymbol, txAssetFilter]);

  const historySummary = useMemo<HistorySummary>(() => {
    const swaps = filteredTransactions;
    const swapCount = swaps.length;
    const gasPls = swaps.reduce((sum, tx) => sum + (tx.fee ?? 0), 0);
    const gasUsd = gasPls * (prices['pulsechain']?.usd ?? 0);
    const tokenTxs = txAssetFilter === 'all'
      ? swaps
      : currentTransactions.filter((tx) =>
        (matchesAssetSymbol(tx.asset, txAssetFilter, tx.chain)
          || matchesAssetSymbol(tx.counterAsset ?? '', txAssetFilter, tx.chain)),
      );

    let cost = 0;
    let proceeds = 0;
    let bought = 0;
    let sold = 0;
    let aggregateSwapPnl = 0;

    tokenTxs.forEach((tx) => {
      const usd = tx.valueUsd ?? 0;
      const assetMatches = txAssetFilter === 'all' || matchesAssetSymbol(tx.asset, txAssetFilter, tx.chain);
      const counterMatches = txAssetFilter !== 'all' && matchesAssetSymbol(tx.counterAsset ?? '', txAssetFilter, tx.chain);
      const currentAsset = currentAssets.find((asset) => matchesAssetSymbol(asset.symbol, tx.asset, asset.chain) && asset.chain === tx.chain);

      if (assetMatches && currentAsset?.price && tx.amount > 0 && usd > 0) {
        aggregateSwapPnl += (tx.amount * currentAsset.price) - usd;
      }

      if (assetMatches) {
        bought += tx.amount;
        cost += usd;
      }

      if (counterMatches) {
        sold += tx.counterAmount ?? 0;
        proceeds += usd;
      }
    });

    const averageCost = bought > 0 ? cost / bought : 0;
    const realizedCost = Math.min(cost, sold * averageCost);
    const realizedPnl = txAssetFilter === 'all' ? aggregateSwapPnl : proceeds - realizedCost;
    const holdingsValue = txAssetFilter === 'all'
      ? currentAssets.reduce((sum, asset) => sum + asset.value, 0)
      : activeHistoryAsset ? activeHistoryAsset.balance * activeHistoryAsset.price : 0;

    return {
      swapCount,
      gasPls,
      gasUsd,
      tokenTxs,
      realizedPnl,
      holdingsValue,
    };
  }, [activeHistoryAsset, currentAssets, currentTransactions, filteredTransactions, matchesAssetSymbol, prices, txAssetFilter]);

  return {
    txTypeFilter,
    setTxTypeFilter,
    txAssetFilter,
    setTxAssetFilter,
    txYearFilter,
    setTxYearFilter,
    txCoinCategory,
    setTxCoinCategory,
    txChainFilter,
    setTxChainFilter,
    txBridgeProtocolFilter,
    setTxBridgeProtocolFilter,
    txOriginChainFilter,
    setTxOriginChainFilter,
    txStakingActionFilter,
    setTxStakingActionFilter,
    filteredTransactions,
    holdingsPulsechainTransactions,
    swapAssetFilterOptions,
    swapYearFilterOptions,
    hasActiveSwapFilters,
    activeHistoryAsset,
    historySummary,
    resetHistoryFilters,
    applyHistoryDrilldownIntent,
  };
}
