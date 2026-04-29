import { useMemo } from 'react';
import {
  EHEX_YIELD_PER_TSHARE,
  PHEX_YIELD_PER_TSHARE,
} from '../../constants';
import type { Asset, Chain, HexStake, Transaction, Wallet } from '../../types';

export interface AppPortfolioSummary {
  totalValue: number;
  liquidValue: number;
  stakingValueUsd: number;
  pnl24h: number;
  pnl24hPercent: number;
  chainDistribution: Record<Chain, number>;
  nativeValue: number;
  nativePlsBalance: number;
  stakedPlsValue: number;
  tokenPlsValue: number;
  netInvestment: number;
  unifiedPnl: number;
  realizedPnl: number;
  chainPnlUsd: Record<Chain, number>;
  chainPnlPercent: Record<Chain, number>;
}

interface CalculatePortfolioSummaryArgs {
  currentAssets: Asset[];
  currentStakes: HexStake[];
  currentTransactions: Transaction[];
  prices: Record<string, { usd?: number } | undefined>;
  wallets: Wallet[];
}

function isStableAsset(asset: string): boolean {
  const u = asset.toUpperCase();
  return u.includes('USDC') || u.includes('USD COIN') || u.includes('USDBC')
    || u.includes('USDT') || u.includes('TETHER')
    || u.includes('DAI');
}

function assetCategory(asset: string): string {
  const u = asset.toUpperCase();
  if (u.includes('USDC') || u.includes('USD COIN') || u.includes('USDBC')) return 'USDC';
  if (u.includes('USDT') || u.includes('TETHER')) return 'USDT';
  if (u.includes('DAI')) return 'DAI';
  if (u === 'ETH') return 'ETH';
  return u;
}

export function calculatePortfolioSummary({
  currentAssets,
  currentStakes,
  currentTransactions,
  prices,
  wallets,
}: CalculatePortfolioSummaryArgs): AppPortfolioSummary {
  const assets = currentAssets;
  const liquidValue = assets.reduce((acc, curr) => acc + curr.value, 0);

  const stakingValueUsd = currentStakes.reduce((acc, s) => {
    if ((s.daysRemaining ?? 0) <= 0) return acc;
    const hexPriceKey = `${s.chain}:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39`;
    const chainHexFallback = s.chain === 'pulsechain' ? prices['pulsechain:hex']?.usd : prices['hex']?.usd;
    const hexPrice = prices[hexPriceKey]?.usd || chainHexFallback || 0;
    const stakedHex = Number(s.stakedHearts ?? 0n) / 1e8;
    const tShares = Number(s.stakeShares ?? 0n) / 1e12;
    const daysStaked = Math.max(0, (s.stakedDays ?? 0) - (s.daysRemaining ?? 0));
    const rate = s.chain === 'pulsechain' ? PHEX_YIELD_PER_TSHARE : EHEX_YIELD_PER_TSHARE;
    const interestHex = tShares * daysStaked * rate;
    return acc + (stakedHex + interestHex) * hexPrice;
  }, 0);

  const totalValue = liquidValue + stakingValueUsd;
  const totalPnl = assets.reduce((acc, curr) => acc + (curr.value * (curr.pnl24h || 0) / 100), 0);

  const distribution: Record<Chain, number> = { pulsechain: 0, ethereum: 0, base: 0 };
  const chainPnlUsd: Record<Chain, number> = { pulsechain: 0, ethereum: 0, base: 0 };
  const chainPnlPercent: Record<Chain, number> = { pulsechain: 0, ethereum: 0, base: 0 };

  assets.forEach((a) => {
    distribution[a.chain] += a.value;
    chainPnlUsd[a.chain] += (a.value * (a.pnl24h || 0) / 100);
  });

  (Object.keys(chainPnlUsd) as Chain[]).forEach((chain) => {
    if (distribution[chain] > 0) {
      chainPnlPercent[chain] = (chainPnlUsd[chain] / distribution[chain]) * 100;
    }
  });

  const plsPrice = assets.find((a) => a.symbol === 'PLS')?.price || 0.00005;
  const nativeValue = totalValue / plsPrice;
  const nativePlsBalance = assets.find((a) => a.symbol === 'PLS' && a.chain === 'pulsechain')?.balance || 0;
  const stakedPlsValue = currentStakes.reduce((acc, curr) => (
    (curr.daysRemaining ?? 0) > 0 ? acc + (curr.estimatedValueUsd || 0) / plsPrice : acc
  ), 0);
  const tokenPlsValue = nativeValue - nativePlsBalance - stakedPlsValue;

  const ownAddrs = new Set(
    wallets
      .map((wallet) => wallet.address?.toLowerCase?.())
      .filter((address): address is string => Boolean(address)),
  );

  const qualifiedInflows = currentTransactions.filter((tx) => {
    if (tx.type !== 'deposit') return false;
    if (tx.chain === 'pulsechain') return false;
    if (!tx.asset || !tx.from || !tx.to) return false;
    const assetUpper = tx.asset.toUpperCase();
    const isEth = assetUpper === 'ETH';
    const isStable = isStableAsset(tx.asset);
    if (!isEth && !isStable) return false;
    const fromOwn = ownAddrs.has(tx.from.toLowerCase());
    const toOwn = ownAddrs.has(tx.to.toLowerCase());
    if (fromOwn || !toOwn) return false;
    return true;
  }).sort((a, b) => a.timestamp - b.timestamp);

  const ethPriceFallback = prices['ethereum']?.usd
    || prices['ethereum:native']?.usd
    || prices['pulsechain:0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c']?.usd
    || 0;

  const txUsdValue = (tx: { asset: string; valueUsd?: number; amount: number }) => {
    if ((tx.valueUsd ?? 0) > 0) return tx.valueUsd ?? 0;
    if (tx.asset.toUpperCase() === 'ETH') return tx.amount * ethPriceFallback;
    return tx.amount;
  };

  const BRIDGE_AMOUNT_TOLERANCE = 0.01;
  const BRIDGE_WINDOW_MS = 12 * 60 * 60 * 1000;
  const deduped = new Set<string>();
  qualifiedInflows.forEach((tx, i) => {
    if (deduped.has(tx.id)) return;
    const cat = assetCategory(tx.asset);
    const usd = txUsdValue(tx);
    for (let j = i + 1; j < qualifiedInflows.length; j += 1) {
      const other = qualifiedInflows[j]!;
      if (deduped.has(other.id)) continue;
      if (other.chain === tx.chain) continue;
      if (other.timestamp - tx.timestamp > BRIDGE_WINDOW_MS) break;
      const otherCat = assetCategory(other.asset);
      if (otherCat !== cat) continue;
      const otherUsd = txUsdValue(other);
      const maxVal = Math.max(usd, otherUsd, 1);
      if (Math.abs(usd - otherUsd) / maxVal <= BRIDGE_AMOUNT_TOLERANCE) {
        deduped.add(other.id);
      }
    }
  });

  const netInvestment = qualifiedInflows.reduce((acc, tx) => {
    if (deduped.has(tx.id)) return acc;
    if (!tx.asset) return acc;
    const assetUpper = tx.asset.toUpperCase();
    const isEth = assetUpper === 'ETH';
    if (isStableAsset(tx.asset)) return acc + tx.amount;
    if (isEth) return acc + txUsdValue(tx);
    return acc;
  }, 0);

  const unifiedPnl = totalValue - netInvestment;

  const costBasisMap: Record<string, { amount: number; totalCost: number }> = {};
  let realizedPnl = 0;
  const sortedTxs = [...currentTransactions].sort((a, b) => a.timestamp - b.timestamp);

  sortedTxs.forEach((tx) => {
    const addCost = (symbol: string, amount: number, value: number) => {
      const assetKey = `${tx.chain}:${symbol}`;
      if (!costBasisMap[assetKey]) costBasisMap[assetKey] = { amount: 0, totalCost: 0 };
      costBasisMap[assetKey].amount += amount;
      costBasisMap[assetKey].totalCost += value;
    };

    const realizeSale = (symbol: string, amount: number, value: number, countProfit: boolean) => {
      const assetKey = `${tx.chain}:${symbol}`;
      if (!costBasisMap[assetKey] || costBasisMap[assetKey].amount <= 0) return;
      const avgCost = costBasisMap[assetKey].totalCost / costBasisMap[assetKey].amount;
      const costOfSold = Math.min(costBasisMap[assetKey].totalCost, amount * avgCost);
      if (countProfit) realizedPnl += value - costOfSold;
      costBasisMap[assetKey].amount = Math.max(0, costBasisMap[assetKey].amount - amount);
      costBasisMap[assetKey].totalCost = Math.max(0, costBasisMap[assetKey].totalCost - costOfSold);
    };

    if (tx.type === 'deposit') {
      addCost(tx.asset, tx.amount, tx.valueUsd || 0);
    } else if (tx.type === 'withdraw') {
      realizeSale(tx.asset, tx.amount, tx.valueUsd || 0, false);
    } else if (tx.type === 'swap') {
      if (tx.counterAsset && tx.counterAmount) {
        realizeSale(tx.counterAsset, tx.counterAmount, tx.valueUsd || 0, true);
      }
      addCost(tx.asset, tx.amount, tx.valueUsd || 0);
    }
  });

  return {
    totalValue,
    liquidValue,
    stakingValueUsd,
    pnl24h: totalPnl,
    pnl24hPercent: totalValue > 0 ? (totalPnl / totalValue) * 100 : 0,
    chainDistribution: distribution,
    nativeValue,
    nativePlsBalance,
    stakedPlsValue,
    tokenPlsValue,
    netInvestment,
    unifiedPnl,
    realizedPnl,
    chainPnlUsd,
    chainPnlPercent,
  };
}

export function usePortfolioSummaryController({
  currentAssets,
  currentStakes,
  currentTransactions,
  prices,
  wallets,
}: CalculatePortfolioSummaryArgs): AppPortfolioSummary {
  return useMemo(() => calculatePortfolioSummary({
    currentAssets,
    currentStakes,
    currentTransactions,
    prices,
    wallets,
  }), [currentAssets, currentStakes, currentTransactions, prices, wallets]);
}
