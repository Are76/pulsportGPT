import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createPublicClient, fallback, formatUnits, getAddress, http } from 'viem';
import { CHAINS, PULSEX_LP_PAIRS, TOKENS } from '../../constants';
import { dataAccess } from '../../services/dataAccess';
import type { Asset, Chain, FarmPosition, HexStake, HistoryPoint, LpPosition, Transaction, Wallet } from '../../types';
import { buildPortfolioSnapshot } from './buildPortfolioSnapshot';
import { enrichPulsechainMissingPrices } from './enrichPulsechainMissingPrices';
import { loadHexStakes } from './loadHexStakes';
import { loadPulsechainFarmPositions, loadPulsechainLpPositions } from './loadPulsechainLiquidity';
import { loadWalletChainData } from './loadWalletChainData';

type SetState<T> = Dispatch<SetStateAction<T>>;

type ControllerArgs = {
  wallets: Wallet[];
  prices: Record<string, any>;
  history: HistoryPoint[];
  realStakes: HexStake[];
  etherscanApiKey: string;
  isFetchingRef: MutableRefObject<boolean>;
  setIsLoading: SetState<boolean>;
  setTokenLogos: SetState<Record<string, string>>;
  setPrices: SetState<Record<string, any>>;
  setSpamTokenIds: SetState<string[]>;
  setRealAssets: SetState<Asset[]>;
  setRealStakes: SetState<HexStake[]>;
  setWalletAssets: SetState<Record<string, Asset[]>>;
  setLpPositions: SetState<LpPosition[]>;
  setFarmPositions: SetState<FarmPosition[]>;
  setTransactions: SetState<Transaction[]>;
  setLastUpdated: SetState<number | null>;
  setHistory: SetState<HistoryPoint[]>;
  staticLogos: Record<string, string>;
  ethHexAddress: string;
  ehexPulsechainAddress: string;
  erc20Abi: readonly unknown[];
  isNoContractDataError: (error: unknown) => boolean;
};

export function createPortfolioFetchController({
  wallets,
  prices,
  history,
  realStakes,
  etherscanApiKey,
  isFetchingRef,
  setIsLoading,
  setTokenLogos,
  setPrices,
  setSpamTokenIds,
  setRealAssets,
  setRealStakes,
  setWalletAssets,
  setLpPositions,
  setFarmPositions,
  setTransactions,
  setLastUpdated,
  setHistory,
  staticLogos,
  ethHexAddress,
  ehexPulsechainAddress,
  erc20Abi,
  isNoContractDataError,
}: ControllerArgs) {
  return async function fetchPortfolio() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const coinIds = Array.from(new Set(Object.values(TOKENS).flat().map((token) => token.coinGeckoId))).join(',');
      const fetchedPrices: Record<string, any> = {};

      try {
        const priceRes = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds}&price_change_percentage=1h,24h,7d&per_page=250&order=market_cap_desc`);
        const priceArray = await priceRes.json();
        if (Array.isArray(priceArray) && priceArray.length > 0) {
          const newLogos: Record<string, string> = {};
          priceArray.forEach((coin: any) => {
            fetchedPrices[coin.id] = {
              usd: coin.current_price,
              usd_24h_change: coin.price_change_percentage_24h_in_currency,
              usd_1h_change: coin.price_change_percentage_1h_in_currency,
              usd_7d_change: coin.price_change_percentage_7d_in_currency,
              image: coin.image,
            };
            if (coin.image) newLogos[coin.id] = coin.image;
          });
          setTokenLogos((prev) => ({ ...prev, ...newLogos }));
        }
      } catch {
        console.warn('coins/markets failed, will try simple/price fallback');
      }

      if (Object.keys(fetchedPrices).length === 0) {
        try {
          const simpleRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`);
          const simpleData = await simpleRes.json();
          Object.entries(simpleData).forEach(([id, data]: [string, any]) => {
            fetchedPrices[id] = { usd: data.usd, usd_24h_change: data.usd_24h_change };
          });
        } catch {
          console.warn('simple/price fallback also failed');
        }
      }

      try {
        const [ethereumQuotes, baseQuotes] = await Promise.all([
          dataAccess.getPrices(TOKENS.ethereum.map((token) => token.address), 'ethereum'),
          dataAccess.getPrices(TOKENS.base.map((token) => token.address), 'base'),
        ]);

        [...ethereumQuotes, ...baseQuotes].forEach((quote) => {
          if (quote.priceUsd == null) return;
          fetchedPrices[`${quote.chain}:${quote.tokenAddress}`] = {
            ...(fetchedPrices[`${quote.chain}:${quote.tokenAddress}`] || {}),
            usd: quote.priceUsd,
          };
          fetchedPrices[quote.tokenAddress] = {
            ...(fetchedPrices[quote.tokenAddress] || {}),
            usd: quote.priceUsd,
          };
        });
      } catch (error) {
        console.warn('Could not fetch unified Ethereum/Base core prices:', error);
      }

      try {
        const GET_RESERVES = '0x0902f1ac';
        const pcRpc = CHAINS.pulsechain.rpc;
        const lpKeys = Object.keys(PULSEX_LP_PAIRS) as (keyof typeof PULSEX_LP_PAIRS)[];
        const batchReq = lpKeys.map((key, index) => ({
          jsonrpc: '2.0',
          id: index,
          method: 'eth_call',
          params: [{ to: PULSEX_LP_PAIRS[key], data: GET_RESERVES }, 'latest'],
        }));

        const batchRes = await fetch(pcRpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batchReq),
        });
        const batchData: any[] = await batchRes.json();
        batchData.sort((a, b) => a.id - b.id);

        const parseRes = (hex: string): [number, number] => {
          if (!hex || hex === '0x') return [0, 0];
          const d = hex.replace('0x', '').padStart(192, '0');
          return [Number(BigInt(`0x${d.slice(0, 64)}`)), Number(BigInt(`0x${d.slice(64, 128)}`))];
        };
        const reserveResult = (key: keyof typeof PULSEX_LP_PAIRS): string => {
          const idx = lpKeys.indexOf(key);
          return idx >= 0 ? (batchData[idx]?.result ?? '0x') : '0x';
        };

        const [daiR0, daiR1] = parseRes(reserveResult('WPLS_DAI'));
        const [usdcR0, usdcR1] = parseRes(reserveResult('WPLS_USDC'));
        const [usdtR0, usdtR1] = parseRes(reserveResult('WPLS_USDT'));
        const plsFromUSDC = usdcR0 > 0 && usdcR1 > 0 ? (usdcR0 / 1e6) / (usdcR1 / 1e18) : 0;
        const plsFromUSDT = usdtR0 > 0 && usdtR1 > 0 ? (usdtR0 / 1e6) / (usdtR1 / 1e18) : 0;
        const wplsUSD = Math.max(plsFromUSDC, plsFromUSDT);

        if (wplsUSD > 0) {
          if (!fetchedPrices.pulsechain) fetchedPrices.pulsechain = {};
          fetchedPrices.pulsechain.usd = wplsUSD;
          fetchedPrices['pulsechain:native'] = { usd: wplsUSD };

          const setTokenPrice = (addrLower: string, priceUSD: number, cgId?: string) => {
            if (priceUSD <= 0) return;
            const existing = cgId ? (fetchedPrices[cgId] || {}) : {};
            const change24h = existing.usd_24h_change;
            fetchedPrices[`pulsechain:${addrLower}`] = {
              ...existing,
              usd: priceUSD,
              ...(change24h != null ? { usd_24h_change: change24h } : {}),
            };
          };

          const [plsxR0, plsxR1] = parseRes(reserveResult('PLSX_WPLS'));
          if (plsxR0 > 0 && plsxR1 > 0) setTokenPrice('0x95b303987a60c71504d99aa1b13b4da07b0790ab', (plsxR1 / plsxR0) * wplsUSD, 'pulsex');

          const [incR0, incR1] = parseRes(reserveResult('INC_WPLS'));
          if (incR0 > 0 && incR1 > 0) setTokenPrice('0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', (incR1 / incR0) * wplsUSD, 'incentive');

          const [hexR0, hexR1] = parseRes(reserveResult('PHEX_WPLS'));
          if (hexR0 > 0 && hexR1 > 0) {
            const pHexUSD = ((hexR1 / 1e18) / (hexR0 / 1e8)) * wplsUSD;
            setTokenPrice(ethHexAddress, pHexUSD, 'hex');
            fetchedPrices['pulsechain:hex'] = { usd: pHexUSD };
            const ehexPriceData = fetchedPrices.hex || prices.hex;
            if (ehexPriceData?.usd) {
              const ehexUsd = ehexPriceData.usd;
              fetchedPrices[`pulsechain:${ehexPulsechainAddress}`] = {
                usd: ehexUsd,
                usd_24h_change: ehexPriceData.usd_24h_change,
                usd_1h_change: ehexPriceData.usd_1h_change,
                usd_7d_change: ehexPriceData.usd_7d_change,
              };
              fetchedPrices[`ethereum:${ethHexAddress}`] = {
                usd: ehexUsd,
                usd_24h_change: ehexPriceData.usd_24h_change,
                usd_1h_change: ehexPriceData.usd_1h_change,
                usd_7d_change: ehexPriceData.usd_7d_change,
              };
            }
          } else {
            const cgHex = fetchedPrices.hex?.usd;
            if (cgHex) {
              fetchedPrices[`pulsechain:${ethHexAddress}`] = { usd: cgHex, usd_24h_change: fetchedPrices.hex?.usd_24h_change };
              fetchedPrices['pulsechain:hex'] = { usd: cgHex };
              fetchedPrices[`pulsechain:${ehexPulsechainAddress}`] = { usd: cgHex, usd_24h_change: fetchedPrices.hex?.usd_24h_change };
              fetchedPrices[`ethereum:${ethHexAddress}`] = { usd: cgHex, usd_24h_change: fetchedPrices.hex?.usd_24h_change };
            }
          }

          const [wethR0, wethR1] = parseRes(reserveResult('PWETH_WPLS'));
          if (wethR0 > 0 && wethR1 > 0) {
            const ethFromLp = (wethR1 / wethR0) * wplsUSD;
            setTokenPrice('0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', ethFromLp, 'ethereum');
            if (!fetchedPrices.ethereum?.usd) fetchedPrices.ethereum = { usd: ethFromLp };
            if (!fetchedPrices['ethereum:native']?.usd) fetchedPrices['ethereum:native'] = { usd: ethFromLp };
            if (!fetchedPrices['base:native']?.usd) fetchedPrices['base:native'] = { usd: ethFromLp };
          }

          const [wbtcR0, wbtcR1] = parseRes(reserveResult('PWBTC_WPLS'));
          if (wbtcR0 > 0 && wbtcR1 > 0) setTokenPrice('0xb17d901469b9208b17d916112988a3fed19b5ca1', ((wbtcR0 / 1e18) / (wbtcR1 / 1e8)) * wplsUSD, 'wrapped-bitcoin');
          if (daiR0 > 0 && daiR1 > 0) setTokenPrice('0xefd766ccb38eaf1dfd701853bfce31359239f305', (daiR0 / daiR1) * wplsUSD);
          if (usdcR0 > 0 && usdcR1 > 0) setTokenPrice('0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', (usdcR1 / 1e18) / (usdcR0 / 1e6) * wplsUSD);
          if (usdtR0 > 0 && usdtR1 > 0) setTokenPrice('0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', (usdtR1 / 1e18) / (usdtR0 / 1e6) * wplsUSD);
          const [sysR0, sysR1] = parseRes(reserveResult('PDAI_SYS_WPLS'));
          if (sysR0 > 0 && sysR1 > 0) setTokenPrice('0x6b175474e89094c44da98b954eedeac495271d0f', (sysR1 / sysR0) * wplsUSD);
          const [prvxR0, prvxR1] = parseRes(reserveResult('PRVX_USDC'));
          if (prvxR0 > 0 && prvxR1 > 0) setTokenPrice('0xf6f8db0aba00007681f8faf16a0fda1c9b030b11', (prvxR0 / 1e6) / (prvxR1 / 1e18));
        }
      } catch (error) {
        console.warn('Could not fetch PulseChain on-chain LP prices:', error);
      }

      setPrices((prev) => ({ ...prev, ...fetchedPrices }));

      const assetMap: Record<string, Asset> = {};
      const walletAssetMap: Record<string, Record<string, Asset>> = {};
      const allStakes: HexStake[] = [];
      const allTransactions: Transaction[] = [];

      const withRetry = async <T,>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> => {
        try {
          return await fn();
        } catch (error: any) {
          const errMsg = error.message?.toLowerCase() || '';
          const shouldRetry = retries > 0 && (
            errMsg.includes('rate limit')
            || errMsg.includes('429')
            || errMsg.includes('request failed')
            || errMsg.includes('internal error')
            || errMsg.includes('timeout')
            || errMsg.includes('retry')
          );
          if (shouldRetry) {
            console.warn(`RPC call failed, retrying... (${retries} left). Error: ${errMsg.slice(0, 100)}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return withRetry(fn, retries - 1, delay * 1.5);
          }
          throw error;
        }
      };

      for (const chainKey of Object.keys(CHAINS) as Chain[]) {
        const chainConfig = CHAINS[chainKey];
        if (!chainConfig) continue;

        const transports = [http(chainConfig.rpc)];
        if ((chainConfig as any).fallbackRpcs) {
          (chainConfig as any).fallbackRpcs.forEach((rpc: string) => {
            transports.push(http(rpc));
          });
        }

        const client = createPublicClient({ transport: fallback(transports, { rank: true }) });

        await Promise.all(wallets.map(async (wallet) => {
          const address = wallet.address as `0x${string}`;
          const apiKey = etherscanApiKey || import.meta.env.VITE_ETHERSCAN_API_KEY || '';
          const chainData = await loadWalletChainData(address, chainKey, fetchedPrices, apiKey);
          const discoveredTokens = chainData.discoveredTokens;

          allTransactions.push(...chainData.transactions);
          Object.entries(chainData.pricePatches).forEach(([key, value]) => {
            fetchedPrices[key] = { ...(fetchedPrices[key] || {}), ...value };
          });
          if (Object.keys(chainData.logoPatches).length > 0) {
            setTokenLogos((prev) => ({ ...prev, ...chainData.logoPatches }));
          }

          const coreTokenBalances = chainData.coreTokenBalances;
          const coreBalanceByAddress = new Map(coreTokenBalances.map((tokenBalance) => [tokenBalance.address.toLowerCase(), tokenBalance.balance]));
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
                  abi: erc20Abi,
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
              if (isWplsMerge) (assetMap[assetKey] as any).wrappedBalance = ((assetMap[assetKey] as any).wrappedBalance || 0) + balanceNum;
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
              } as any;
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
              } as any;
            }
          }));

          if ((chainKey === 'pulsechain' || chainKey === 'ethereum') && 'hexAddress' in chainConfig) {
            const stakeClient = chainKey === 'pulsechain'
              ? createPublicClient({ transport: http(chainConfig.rpc) })
              : client;
            const stakes = await loadHexStakes({
              address,
              chain: chainKey,
              hexAddress: chainConfig.hexAddress,
              walletName: wallet.name,
              fetchedPrices,
              client: stakeClient,
              withRetry,
            });
            allStakes.push(...stakes);
          }
        }));
      }

      const fallbackLogos = await enrichPulsechainMissingPrices(assetMap, walletAssetMap);
      if (Object.keys(fallbackLogos).length > 0) {
        setTokenLogos((prev) => ({ ...prev, ...fallbackLogos }));
      }

      const pricedIds = Object.values(assetMap).filter((asset) => asset.price > 0).map((asset) => asset.id);
      if (pricedIds.length > 0) {
        setSpamTokenIds((prev) => prev.filter((id) => !pricedIds.includes(id)));
      }

      const snapshot = buildPortfolioSnapshot({
        assetMap,
        walletAssetMap,
        allStakes,
        allTransactions,
        fetchedPrices,
        wallets,
        previousHistory: history,
        previousRealStakes: realStakes,
      });

      setRealAssets(snapshot.realAssets);
      setRealStakes(snapshot.realStakes);
      setWalletAssets(snapshot.walletAssets);

      try {
        const walletAddrs = wallets.map((wallet) => wallet.address.toLowerCase());
        const lpPositions = await loadPulsechainLpPositions(CHAINS.pulsechain.rpc, walletAddrs, fetchedPrices);
        setLpPositions(lpPositions);
      } catch (error) {
        console.warn('LP position fetch failed:', error);
      }

      try {
        const walletAddrs = wallets.map((wallet) => wallet.address.toLowerCase());
        const farmPositions = await loadPulsechainFarmPositions(CHAINS.pulsechain.rpc, walletAddrs, fetchedPrices);
        setFarmPositions(farmPositions);
      } catch (error) {
        console.warn('Farm position fetch failed:', error);
      }

      setTransactions(snapshot.processedTransactions);
      setLastUpdated(Date.now());
      setHistory(snapshot.history);
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };
}
