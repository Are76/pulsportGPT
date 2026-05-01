/**
 * usePriceController
 * ------------------
 * Manages CoinGecko price fetching + PulseX LP on-chain price fallback.
 * Exposes `prices` (a stable reference updated on each successful fetch) and
 * `refreshPrices()` for manual triggers.
 *
 * Runs on a 5-minute auto-refresh timer.  Does NOT perform any balance or
 * transaction fetching — single responsibility.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAINS, PULSEX_LP_PAIRS, TOKENS } from '../../constants';

const REFRESH_INTERVAL_MS = 5 * 60_000;

type PriceMap = Record<string, any>;

function buildCoinIds(): string {
  return Array.from(
    new Set(Object.values(TOKENS).flat().map((token) => token.coinGeckoId)),
  ).join(',');
}

async function fetchCoinGeckoPrices(coinIds: string): Promise<PriceMap> {
  const prices: PriceMap = {};

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds}&price_change_percentage=1h,24h,7d&per_page=250&order=market_cap_desc`,
    );
    const arr = await res.json();
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach((coin: any) => {
        prices[coin.id] = {
          usd: coin.current_price,
          usd_24h_change: coin.price_change_percentage_24h_in_currency,
          usd_1h_change: coin.price_change_percentage_1h_in_currency,
          usd_7d_change: coin.price_change_percentage_7d_in_currency,
          image: coin.image,
        };
      });
      return prices;
    }
  } catch {
    console.warn('usePriceController: coins/markets failed, trying simple/price fallback');
  }

  // Fallback: simple price
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`,
    );
    const data = await res.json();
    Object.entries(data).forEach(([id, d]: [string, any]) => {
      prices[id] = { usd: d.usd, usd_24h_change: d.usd_24h_change };
    });
  } catch {
    console.warn('usePriceController: simple/price fallback also failed');
  }

  return prices;
}

async function fetchOnChainLpPrices(
  base: PriceMap,
  ethHexAddress: string,
  ehexPulsechainAddress: string,
): Promise<PriceMap> {
  const patched: PriceMap = { ...base };

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
    batchData.sort((a: any, b: any) => a.id - b.id);

    const parseRes = (hex: string): [number, number] => {
      if (!hex || hex === '0x') return [0, 0];
      const d = hex.replace('0x', '').padStart(192, '0');
      return [Number(BigInt(`0x${d.slice(0, 64)}`)), Number(BigInt(`0x${d.slice(64, 128)}`))] as [number, number];
    };
    const reserveResult = (key: keyof typeof PULSEX_LP_PAIRS): string => {
      const idx = lpKeys.indexOf(key);
      return idx >= 0 ? (batchData[idx]?.result ?? '0x') : '0x';
    };

    const setTokenPrice = (addrLower: string, priceUSD: number, cgId?: string) => {
      if (priceUSD <= 0) return;
      const existing = cgId ? (patched[cgId] || {}) : {};
      const change24h = existing.usd_24h_change;
      patched[`pulsechain:${addrLower}`] = {
        ...existing,
        usd: priceUSD,
        ...(change24h != null ? { usd_24h_change: change24h } : {}),
      };
    };

    const [daiR0, daiR1] = parseRes(reserveResult('WPLS_DAI'));
    const [usdcR0, usdcR1] = parseRes(reserveResult('WPLS_USDC'));
    const [usdtR0, usdtR1] = parseRes(reserveResult('WPLS_USDT'));
    const plsFromUSDC = usdcR0 > 0 && usdcR1 > 0 ? (usdcR0 / 1e6) / (usdcR1 / 1e18) : 0;
    const plsFromUSDT = usdtR0 > 0 && usdtR1 > 0 ? (usdtR0 / 1e6) / (usdtR1 / 1e18) : 0;
    const wplsUSD = Math.max(plsFromUSDC, plsFromUSDT);

    if (wplsUSD > 0) {
      if (!patched.pulsechain) patched.pulsechain = {};
      patched.pulsechain.usd = wplsUSD;
      patched['pulsechain:native'] = { usd: wplsUSD };

      const [plsxR0, plsxR1] = parseRes(reserveResult('PLSX_WPLS'));
      if (plsxR0 > 0 && plsxR1 > 0) setTokenPrice('0x95b303987a60c71504d99aa1b13b4da07b0790ab', (plsxR1 / plsxR0) * wplsUSD, 'pulsex');

      const [incR0, incR1] = parseRes(reserveResult('INC_WPLS'));
      if (incR0 > 0 && incR1 > 0) setTokenPrice('0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', (incR1 / incR0) * wplsUSD, 'incentive');

      const [hexR0, hexR1] = parseRes(reserveResult('PHEX_WPLS'));
      if (hexR0 > 0 && hexR1 > 0) {
        const pHexUSD = ((hexR1 / 1e18) / (hexR0 / 1e8)) * wplsUSD;
        setTokenPrice(ethHexAddress, pHexUSD, 'hex');
        patched['pulsechain:hex'] = { usd: pHexUSD };
        const ehexPriceData = patched.hex;
        if (ehexPriceData?.usd) {
          const ehexUsd = ehexPriceData.usd;
          patched[`pulsechain:${ehexPulsechainAddress}`] = {
            usd: ehexUsd,
            usd_24h_change: ehexPriceData.usd_24h_change,
            usd_1h_change: ehexPriceData.usd_1h_change,
            usd_7d_change: ehexPriceData.usd_7d_change,
          };
          patched[`ethereum:${ethHexAddress}`] = {
            usd: ehexUsd,
            usd_24h_change: ehexPriceData.usd_24h_change,
            usd_1h_change: ehexPriceData.usd_1h_change,
            usd_7d_change: ehexPriceData.usd_7d_change,
          };
        } else {
          const cgHex = patched.hex?.usd;
          if (cgHex) {
            patched[`pulsechain:${ethHexAddress}`] = { usd: cgHex, usd_24h_change: patched.hex?.usd_24h_change };
            patched['pulsechain:hex'] = { usd: cgHex };
            patched[`pulsechain:${ehexPulsechainAddress}`] = { usd: cgHex, usd_24h_change: patched.hex?.usd_24h_change };
            patched[`ethereum:${ethHexAddress}`] = { usd: cgHex, usd_24h_change: patched.hex?.usd_24h_change };
          }
        }
      }

      const [wethR0, wethR1] = parseRes(reserveResult('PWETH_WPLS'));
      if (wethR0 > 0 && wethR1 > 0) {
        const ethFromLp = (wethR1 / wethR0) * wplsUSD;
        setTokenPrice('0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', ethFromLp, 'ethereum');
        if (!patched.ethereum?.usd) patched.ethereum = { usd: ethFromLp };
        if (!patched['ethereum:native']?.usd) patched['ethereum:native'] = { usd: ethFromLp };
        if (!patched['base:native']?.usd) patched['base:native'] = { usd: ethFromLp };
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
    console.warn('usePriceController: on-chain LP price fetch failed:', error);
  }

  return patched;
}

export interface PriceControllerOptions {
  ethHexAddress: string;
  ehexPulsechainAddress: string;
  onLogos?: (logos: Record<string, string>) => void;
}

export interface PriceController {
  prices: PriceMap;
  refreshPrices: () => Promise<void>;
}

export function usePriceController({
  ethHexAddress,
  ehexPulsechainAddress,
  onLogos,
}: PriceControllerOptions): PriceController {
  const [prices, setPrices] = useState<PriceMap>({});
  const isFetchingRef = useRef(false);

  const refreshPrices = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const coinIds = buildCoinIds();
      const cgPrices = await fetchCoinGeckoPrices(coinIds);

      // Collect logos separately
      if (onLogos) {
        const logos: Record<string, string> = {};
        Object.entries(cgPrices).forEach(([id, data]: [string, any]) => {
          if (data?.image) logos[id] = data.image;
        });
        if (Object.keys(logos).length > 0) onLogos(logos);
      }

      const full = await fetchOnChainLpPrices(cgPrices, ethHexAddress, ehexPulsechainAddress);
      setPrices(full);
    } finally {
      isFetchingRef.current = false;
    }
  }, [ehexPulsechainAddress, ethHexAddress, onLogos]);

  // Initial fetch
  useEffect(() => {
    void refreshPrices();
  }, [refreshPrices]);

  // 5-minute auto-refresh
  useEffect(() => {
    const id = setInterval(() => void refreshPrices(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshPrices]);

  return { prices, refreshPrices };
}
