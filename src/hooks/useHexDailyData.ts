/**
 * useHexDailyData
 *
 * Fetches `dailyDataRange` from the HEX contract on PulseChain and Ethereum,
 * caches the result, and exposes decoded daily payout data so callers can
 * calculate real yield instead of relying on static constants.
 *
 * Ported from GitLab pulsechain-dashboard/useHex.jsx and converted to TypeScript.
 */
import { useState, useEffect, useRef } from 'react';

// --- HEX contract config ------------------------------------------------------

const HEX_ADDRESS = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39'; // same on both chains

const PULSECHAIN_RPC_PRIMARY  = 'https://rpc-pulsechain.g4mm4.io';
const PULSECHAIN_RPC_FALLBACK = 'https://rpc.pulsechain.com';
const ETHEREUM_RPC_PRIMARY    = 'https://ethereum-rpc.publicnode.com';
const ETHEREUM_RPC_FALLBACK   = 'https://eth.drpc.org';

/** How many recent days of daily data to fetch (enough for a rolling average). */
const FETCH_DAYS = 30;

/** Cache TTL in milliseconds - re-fetch once per hour. */
const CACHE_TTL_MS = 60 * 60 * 1000;

const CACHE_KEY_PULSE = 'hex_daily_data_pulse';
const CACHE_KEY_ETH   = 'hex_daily_data_eth';

// --- Types --------------------------------------------------------------------

/** One decoded day entry from the HEX dailyDataRange response. */
export interface HexDayData {
  day: number;
  /** HEX paid per T-Share that day (in HEX, i.e. divided by 1e8 then / 1e12). */
  payoutPerTShare: number;
  /** Total HEX staked that day (hearts). */
  totalStaked: bigint;
}

export interface HexDailyDataResult {
  pulsechain: HexDayData[];
  ethereum: HexDayData[];
  /** Average payout per T-Share over the fetched window (PulseChain). */
  avgPayoutPulse: number;
  /** Average payout per T-Share over the fetched window (Ethereum). */
  avgPayoutEth: number;
  loading: boolean;
  error: string | null;
}

// --- RPC helpers -------------------------------------------------------------

/** Call currentDay() - selector 0x5c9302c9 */
async function fetchCurrentDay(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: HEX_ADDRESS, data: '0x5c9302c9' }, 'latest'],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json: { result?: string } = await res.json();
  const hex = (json.result ?? '0x0').replace('0x', '') || '0';
  return parseInt(hex, 16);
}

/**
 * Call dailyDataRange(beginDay, endDay).
 * Selector: keccak256("dailyDataRange(uint256,uint256)") = 0x6fa8b2f5
 */
async function fetchDailyDataRange(
  rpcUrl: string,
  beginDay: number,
  endDay: number,
): Promise<string> {
  const pad = (n: number) => BigInt(n).toString(16).padStart(64, '0');
  // ABI-encode: selector + offset(0x40) + length + data[]
  // For dynamic array output we call and get raw ABI bytes back.
  const data =
    '0x6fa8b2f5' +
    pad(beginDay) +
    pad(endDay);
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'eth_call',
      params: [{ to: HEX_ADDRESS, data }, 'latest'],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json: { result?: string } = await res.json();
  return json.result ?? '0x';
}

/**
 * Decode the raw ABI-encoded uint256[] from dailyDataRange.
 *
 * HEX packs two values per uint256:
 *   bits 0-71   -> payout (hearts per raw share x 1e18 scale)
 *   bits 72-143 -> totalStaked (hearts)
 *
 * payoutPerTShare (HEX) = payout x 1e12 / 1e8 (T-share = 1e12 raw shares; 1 HEX = 1e8 hearts)
 */
function decodeDailyData(raw: string, beginDay: number): HexDayData[] {
  const hex = raw.replace('0x', '');
  if (hex.length < 128) return []; // need at least offset + length words

  // Word 0: offset to array data (always 0x20 = 32)
  // Word 1: array length
  const arrayLen = parseInt(hex.slice(64, 128), 16);
  if (arrayLen === 0) return [];

  const entries: HexDayData[] = [];
  const dataStart = 128; // after offset + length words (2 x 64 hex chars)

  for (let i = 0; i < arrayLen; i++) {
    const wordStart = dataStart + i * 64;
    if (wordStart + 64 > hex.length) break;
    const word = BigInt('0x' + hex.slice(wordStart, wordStart + 64));

    // Lower 72 bits = payout (hearts per raw share, scaled by 1e18)
    const payoutRaw = word & ((1n << 72n) - 1n);
    // Next 72 bits = totalStaked (hearts)
    const totalStaked = (word >> 72n) & ((1n << 72n) - 1n);

    // Convert to HEX per T-Share:
    //   payoutRaw is hearts per raw share x 10^18 (HEX contract internal scale)
    //   1 T-Share = 10^12 raw shares
    //   1 HEX     = 10^8  hearts
    //   payoutPerTShare(HEX) = payoutRaw x 10^12 / (10^8 x 10^18) = payoutRaw / 10^14
    const payoutPerTShare = Number(payoutRaw) / 1e14;

    entries.push({
      day: beginDay + i,
      payoutPerTShare,
      totalStaked,
    });
  }

  return entries;
}

// --- Cache helpers ------------------------------------------------------------

interface CachedData {
  ts: number;
  days: HexDayData[];
}

function tryLoadCache(key: string): HexDayData[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: CachedData = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.days;
  } catch {
    return null;
  }
}

function saveCache(key: string, days: HexDayData[]): void {
  try {
    const data: CachedData = { ts: Date.now(), days };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable
  }
}

// --- Fetch one chain ----------------------------------------------------------

async function fetchChainDailyData(
  primaryRpc: string,
  fallbackRpc: string,
): Promise<HexDayData[]> {
  // Step 1: get current day
  let currentDay: number;
  try {
    currentDay = await fetchCurrentDay(primaryRpc);
  } catch {
    currentDay = await fetchCurrentDay(fallbackRpc);
  }

  if (currentDay <= 0) return [];

  const beginDay = Math.max(1, currentDay - FETCH_DAYS);
  const endDay   = currentDay; // exclusive in the HEX contract

  // Step 2: fetch daily data range
  let raw: string;
  try {
    raw = await fetchDailyDataRange(primaryRpc, beginDay, endDay);
  } catch {
    raw = await fetchDailyDataRange(fallbackRpc, beginDay, endDay);
  }

  return decodeDailyData(raw, beginDay);
}

// --- Hook ---------------------------------------------------------------------

export function useHexDailyData(): HexDailyDataResult {
  const [pulsechain, setPulsechain] = useState<HexDayData[]>(() => tryLoadCache(CACHE_KEY_PULSE) ?? []);
  const [ethereum,   setEthereum]   = useState<HexDayData[]>(() => tryLoadCache(CACHE_KEY_ETH)   ?? []);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Skip if we already loaded from cache and it's still fresh
    const cachedPulse = tryLoadCache(CACHE_KEY_PULSE);
    const cachedEth   = tryLoadCache(CACHE_KEY_ETH);
    if (cachedPulse && cachedEth && !fetchedRef.current) {
      setPulsechain(cachedPulse);
      setEthereum(cachedEth);
      fetchedRef.current = true;
      return;
    }

    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchChainDailyData(PULSECHAIN_RPC_PRIMARY, PULSECHAIN_RPC_FALLBACK),
      fetchChainDailyData(ETHEREUM_RPC_PRIMARY,   ETHEREUM_RPC_FALLBACK),
    ]).then(([pulseRes, ethRes]) => {
      // Use a local variable to track whether an error was already set,
      // avoiding reliance on the stale `error` state value from closure.
      let errorSet = false;

      if (pulseRes.status === 'fulfilled' && pulseRes.value.length > 0) {
        setPulsechain(pulseRes.value);
        saveCache(CACHE_KEY_PULSE, pulseRes.value);
      } else if (pulseRes.status === 'rejected') {
        setError('Failed to fetch PulseChain HEX daily data');
        errorSet = true;
      }

      if (ethRes.status === 'fulfilled' && ethRes.value.length > 0) {
        setEthereum(ethRes.value);
        saveCache(CACHE_KEY_ETH, ethRes.value);
      } else if (ethRes.status === 'rejected' && !errorSet) {
        setError('Failed to fetch Ethereum HEX daily data');
      }
    }).finally(() => {
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute rolling averages
  const avgPayoutPulse = pulsechain.length > 0
    ? pulsechain.reduce((s, d) => s + d.payoutPerTShare, 0) / pulsechain.length
    : 0;
  const avgPayoutEth = ethereum.length > 0
    ? ethereum.reduce((s, d) => s + d.payoutPerTShare, 0) / ethereum.length
    : 0;

  return { pulsechain, ethereum, avgPayoutPulse, avgPayoutEth, loading, error };
}
