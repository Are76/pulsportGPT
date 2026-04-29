/**
 * useBalanceController
 * --------------------
 * Manages token balance fetching for all wallets × chains, spam detection,
 * LP positions, and HEX stakes.
 *
 * Depends on `prices` from `usePriceController` — call `refresh()` after
 * prices are available.
 *
 * Exposes:
 *   - `assets`           — sorted Asset[] (all wallets combined)
 *   - `walletAssets`     — per-wallet Asset[] map
 *   - `stakes`           — HexStake[]
 *   - `lpPositions`      — LP positions (PulseChain only)
 *   - `farmPositions`    — farm positions (PulseChain only)
 *   - `spamTokenIds`     — token IDs identified as spam
 *   - `isLoading`        — true while a fetch is in flight
 *   - `refresh()`        — trigger a manual re-fetch
 */

import { useCallback, useRef, useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import { CHAINS, ERC20_ABI, TOKENS } from '../../constants';
import { CHAIN_CLIENTS } from '../../lib/viemClients';
import type { Asset, Chain, FarmPosition, HexStake, LpPosition, Wallet } from '../../types';
import { withRetry } from '../../utils/withRetry';
import { enrichPulsechainMissingPrices } from './enrichPulsechainMissingPrices';
import { loadHexStakes } from './loadHexStakes';
import { loadPulsechainFarmPositions, loadPulsechainLpPositions } from './loadPulsechainLiquidity';
import { loadWalletChainData } from './loadWalletChainData';

export interface BalanceControllerOptions {
  wallets: Wallet[];
  prices: Record<string, any>;
  staticLogos: Record<string, string>;
  ethHexAddress: string;
  ehexPulsechainAddress: string;
  etherscanApiKey: string;
  isNoContractDataError: (error: unknown) => boolean;
  onSpamTokenIds?: (ids: string[]) => void;
  onLogos?: (logos: Record<string, string>) => void;
  onPricePatches?: (patches: Record<string, any>) => void;
}

export interface BalanceController {
  assets: Asset[];
  walletAssets: Record<string, Asset[]>;
  stakes: HexStake[];
  lpPositions: LpPosition[];
  farmPositions: FarmPosition[];
  spamTokenIds: string[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useBalanceController({
  wallets,
  prices,
  staticLogos,
  ethHexAddress,
  ehexPulsechainAddress,
  etherscanApiKey,
  isNoContractDataError,
  onSpamTokenIds,
  onLogos,
  onPricePatches,
}: BalanceControllerOptions): BalanceController {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [walletAssets, setWalletAssets] = useState<Record<string, Asset[]>>({});
  const [stakes, setStakes] = useState<HexStake[]>([]);
  const [lpPositions, setLpPositions] = useState<LpPosition[]>([]);
  const [farmPositions, setFarmPositions] = useState<FarmPosition[]>([]);
  const [spamTokenIds, setSpamTokenIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isFetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (isFetchingRef.current || wallets.length === 0) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    const fetchedPrices: Record<string, any> = { ...prices };
    const assetMap: Record<string, Asset> = {};
    const walletAssetMap: Record<string, Record<string, Asset>> = {};
    const allStakes: HexStake[] = [];

    try {
      for (const chainKey of Object.keys(CHAINS) as Chain[]) {
        const chainConfig = CHAINS[chainKey];
        if (!chainConfig) continue;

        const client = CHAIN_CLIENTS[chainKey];

        await Promise.all(wallets.map(async (wallet) => {
          const address = wallet.address as `0x${string}`;
          const apiKey = etherscanApiKey || import.meta.env.VITE_ETHERSCAN_API_KEY || '';
          const chainData = await loadWalletChainData(address, chainKey, fetchedPrices, apiKey);
          const discoveredTokens = chainData.discoveredTokens;

          // Surface price and logo patches upward
          Object.entries(chainData.pricePatches).forEach(([key, value]) => {
            fetchedPrices[key] = { ...(fetchedPrices[key] || {}), ...value };
          });
          if (Object.keys(chainData.logoPatches).length > 0) {
            onLogos?.(chainData.logoPatches);
          }
          if (Object.keys(chainData.pricePatches).length > 0) {
            onPricePatches?.(chainData.pricePatches);
          }

          const coreTokenBalances = chainData.coreTokenBalances;
          const coreBalanceByAddress = new Map(
            coreTokenBalances.map((tb) => [tb.address.toLowerCase(), tb.balance]),
          );
          const tokensToFetch = [
            ...TOKENS[chainKey].map((token) => ({ ...token, isDiscovered: false })),
            ...discoveredTokens.filter((token) => !coreBalanceByAddress.has(token.address.toLowerCase())),
          ];

          await Promise.all(tokensToFetch.map(async (token) => {
            let balanceNum = 0;
            try {
              const cachedCoreBalance = coreBalanceByAddress.get(token.address.toLowerCase());
              if (cachedCoreBalance != null) {
                balanceNum = cachedCoreBalance;
              } else if (token.address === 'native') {
                const nativeBalance = await withRetry(() => client.getBalance({ address }));
                balanceNum = Number(formatUnits(nativeBalance, token.decimals));
              } else {
                let checksummedAddr: `0x${string}`;
                try {
                  checksummedAddr = getAddress(token.address);
                } catch {
                  console.warn(`Skipping ${token.symbol} on ${chainKey}: invalid address ${token.address}`);
                  return;
                }
                const data = await withRetry(() => client.readContract({
                  address: checksummedAddr,
                  abi: ERC20_ABI,
                  functionName: 'balanceOf',
                  args: [address],
                } as any));
                balanceNum = Number(formatUnits(BigInt(data as any), token.decimals));
              }
            } catch (error) {
              if (isNoContractDataError(error)) return;
              if (import.meta.env.DEV) console.debug(`Could not fetch balance for ${token.symbol} on ${chainKey}:`, error);
              return;
            }

            if (balanceNum <= 0) return;

            const priceKey = `${chainKey}:${token.address.toLowerCase()}`;
            const priceData = fetchedPrices[priceKey] || fetchedPrices[token.address.toLowerCase()] || fetchedPrices[token.coinGeckoId];
            const price = priceData?.usd || 0;
            const priceChange24h = priceData?.usd_24h_change ?? fetchedPrices[token.coinGeckoId]?.usd_24h_change ?? 0;
            const priceChange1h = priceData?.usd_1h_change ?? fetchedPrices[token.coinGeckoId]?.usd_1h_change ?? 0;
            const priceChange7d = priceData?.usd_7d_change ?? fetchedPrices[token.coinGeckoId]?.usd_7d_change ?? 0;
            const isWplsMerge = chainKey === 'pulsechain' && token.symbol === 'WPLS';
            const isAddressKeyedDiscovery = Boolean((token as any).isDiscovered && token.address !== 'native');
            const assetKey = isWplsMerge
              ? 'pulsechain-PLS'
              : isAddressKeyedDiscovery
                ? `${chainKey}-${token.address.toLowerCase()}`
                : `${chainKey}-${token.symbol}`;

            if (assetMap[assetKey]) {
              assetMap[assetKey].balance += balanceNum;
              assetMap[assetKey].value += balanceNum * price;
              if (isWplsMerge) assetMap[assetKey].wrappedBalance = (assetMap[assetKey].wrappedBalance || 0) + balanceNum;
            } else {
              const effectiveAddress = isWplsMerge ? 'native' : token.address;
              const addrLower = effectiveAddress === 'native' ? null : effectiveAddress.toLowerCase();
              const staticLogoOverride = addrLower ? staticLogos[addrLower] : null;
              const cgLogo = staticLogoOverride ? null : (priceData?.image ?? null);
              const twChain = chainKey === 'ethereum' ? 'ethereum' : chainKey === 'base' ? 'base' : null;
              let twLogo: string | null = null;
              if (!staticLogoOverride && twChain && effectiveAddress !== 'native') {
                try { twLogo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${twChain}/assets/${getAddress(effectiveAddress)}/logo.png`; } catch {}
              }
              let pulsexLogo: string | null = null;
              if (!staticLogoOverride && chainKey === 'pulsechain' && token.address !== 'native') {
                try { pulsexLogo = `https://tokens.app.pulsex.com/images/tokens/${getAddress(token.address)}.png`; } catch {}
              }
              const logoUrl = staticLogoOverride || cgLogo || twLogo || pulsexLogo || null;

              assetMap[assetKey] = {
                id: assetKey,
                symbol: isWplsMerge ? 'PLS' : token.symbol,
                name: isWplsMerge ? 'PulseChain' : ((token as any).name || (token.symbol === 'eHEX' ? 'HEX (from Ethereum)' : `${token.symbol} (${chainConfig.name})`)),
                balance: balanceNum,
                price,
                priceChange24h,
                priceChange1h,
                priceChange7d,
                value: balanceNum * price,
                chain: chainKey,
                pnl24h: priceChange24h,
                isCore: true,
                isBridged: false,
                address: effectiveAddress,
                isSpam: false,
                logoUrl,
                wrappedBalance: isWplsMerge ? balanceNum : 0,
              };
            }

            const walletAddr = wallet.address.toLowerCase();
            if (!walletAssetMap[walletAddr]) walletAssetMap[walletAddr] = {};
            if (walletAssetMap[walletAddr][assetKey]) {
              walletAssetMap[walletAddr][assetKey].balance += balanceNum;
              walletAssetMap[walletAddr][assetKey].value += balanceNum * price;
            } else {
              walletAssetMap[walletAddr][assetKey] = {
                ...assetMap[assetKey],
                balance: balanceNum,
                value: balanceNum * price,
                id: `${walletAddr}-${assetKey}`,
              };
            }
          }));

          if ((chainKey === 'pulsechain' || chainKey === 'ethereum') && 'hexAddress' in chainConfig) {
            const stakeList = await loadHexStakes({
              address,
              chain: chainKey,
              hexAddress: (chainConfig as any).hexAddress,
              walletName: wallet.name,
              fetchedPrices,
              client,
              withRetry,
            });
            allStakes.push(...stakeList);
          }
        }));
      }

      // Enrich any missing logos/prices from DexScreener
      const fallbackLogos = await enrichPulsechainMissingPrices(assetMap, walletAssetMap);
      if (Object.keys(fallbackLogos).length > 0) {
        onLogos?.(fallbackLogos);
      }

      // Spam detection: assets with prices are not spam
      const pricedIds = Object.values(assetMap).filter((a) => a.price > 0).map((a) => a.id);
      const newSpam = spamTokenIds.filter((id) => !pricedIds.includes(id));
      setSpamTokenIds(newSpam);
      onSpamTokenIds?.(newSpam);

      const realAssets = Object.values(assetMap).sort((a, b) => b.value - a.value);
      setAssets(realAssets);

      const walletAssetsResult: Record<string, Asset[]> = {};
      Object.entries(walletAssetMap).forEach(([addr, byId]) => {
        walletAssetsResult[addr] = Object.values(byId).sort((a, b) => b.value - a.value);
      });
      setWalletAssets(walletAssetsResult);
      setStakes(allStakes);

      // LP / farm positions (PulseChain only)
      const walletAddrs = wallets.map((w) => w.address.toLowerCase());
      const tokenPrices: Record<string, number> = {};
      Object.entries(fetchedPrices).forEach(([key, val]) => {
        if (typeof val?.usd === 'number') tokenPrices[key] = val.usd;
      });

      const [lpResult, farmResult] = await Promise.allSettled([
        loadPulsechainLpPositions(CHAINS.pulsechain.rpc, walletAddrs, fetchedPrices),
        loadPulsechainFarmPositions(CHAINS.pulsechain.rpc, walletAddrs, fetchedPrices),
      ]);
      if (lpResult.status === 'fulfilled') setLpPositions(lpResult.value);
      else console.warn('useBalanceController: LP fetch failed:', lpResult.reason);
      if (farmResult.status === 'fulfilled') setFarmPositions(farmResult.value);
      else console.warn('useBalanceController: farm fetch failed:', farmResult.reason);
    } catch (error) {
      console.error('useBalanceController: refresh failed:', error);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [
    ehexPulsechainAddress,
    ethHexAddress,
    etherscanApiKey,
    isNoContractDataError,
    onLogos,
    onPricePatches,
    onSpamTokenIds,
    prices,
    spamTokenIds,
    staticLogos,
    wallets,
  ]);

  return {
    assets,
    walletAssets,
    stakes,
    lpPositions,
    farmPositions,
    spamTokenIds,
    isLoading,
    refresh,
  };
}
