import { getAddress } from 'viem';
import { EHEX_YIELD_BI_DEN, EHEX_YIELD_BI_NUM, HEX_ABI, PHEX_YIELD_BI_DEN, PHEX_YIELD_BI_NUM } from '../../constants';
import type { Chain, HexStake } from '../../types';

type PriceEntry = { usd?: number };
type PriceMap = Record<string, PriceEntry | undefined>;

type RetryFn = <T>(fn: () => Promise<T>, retries?: number, delay?: number) => Promise<T>;

type ReadContractClient = {
  readContract: (args: any) => Promise<unknown>;
};

type LoadHexStakesArgs = {
  address: `0x${string}`;
  chain: Extract<Chain, 'pulsechain' | 'ethereum'>;
  hexAddress: string;
  walletName: string;
  fetchedPrices: PriceMap;
  client: ReadContractClient;
  withRetry: RetryFn;
};

export async function loadHexStakes({
  address,
  chain,
  hexAddress,
  walletName,
  fetchedPrices,
  client,
  withRetry,
}: LoadHexStakesArgs): Promise<HexStake[]> {
  const stakes: HexStake[] = [];
  const hexAddr = getAddress(hexAddress);
  let hexStakeCount = 0n;
  let hexCurrentDay = 0n;

  try {
    try {
      hexStakeCount = await withRetry(() => client.readContract({
        address: hexAddr,
        abi: HEX_ABI,
        functionName: 'stakeCount',
        args: [address],
      } as any)) as bigint;
    } catch (error: any) {
      console.error(`[HEX stakes] stakeCount failed on ${chain} (${address.slice(0, 8)}...): ${error?.shortMessage ?? error?.message ?? String(error)}`);
    }

    try {
      hexCurrentDay = await withRetry(() => client.readContract({
        address: hexAddr,
        abi: HEX_ABI,
        functionName: 'currentDay',
      } as any)) as bigint;
    } catch (error: any) {
      console.error(`[HEX stakes] currentDay failed on ${chain}: ${error?.shortMessage ?? error?.message ?? String(error)}`);
    }

    if (Number(hexStakeCount) === 0) {
      return stakes;
    }

    const stakeResults = await Promise.allSettled(
      Array.from({ length: Number(hexStakeCount) }, (_, index) =>
        withRetry(() => client.readContract({
          address: hexAddr,
          abi: HEX_ABI,
          functionName: 'stakeLists',
          args: [address, BigInt(index)],
        } as any)),
      ),
    );

    stakeResults.forEach((settled, index) => {
      if (settled.status === 'rejected') {
        console.warn(`[HEX stakes] index ${index} rejected on ${chain}: ${settled.reason?.message ?? settled.reason}`);
        return;
      }

      const stakeResult: any = settled.value;
      if (!stakeResult) return;

      let stakeId: any;
      let stakedHearts: any;
      let stakeShares: any;
      let lockedDay: any;
      let stakedDays: any;
      let unlockedDay: any;
      let isAutoStake: any;

      if (Array.isArray(stakeResult)) {
        [stakeId, stakedHearts, stakeShares, lockedDay, stakedDays, unlockedDay, isAutoStake] = stakeResult;
      } else {
        ({ stakeId, stakedHearts, stakeShares, lockedDay, stakedDays, unlockedDay, isAutoStake } = stakeResult);
      }

      if (stakeId === undefined) return;

      const sharesBI = BigInt(stakeShares ?? 0);
      const heartsBI = BigInt(stakedHearts ?? 0);
      const lockedDayN = Number(lockedDay ?? 0);
      const stakedDaysN = Number(stakedDays ?? 0);
      const currentDayN = Number(hexCurrentDay);
      const progress = Math.min(100, Math.max(0, ((currentDayN - lockedDayN) / Math.max(1, stakedDaysN)) * 100));
      const daysStakedN = Math.max(0, currentDayN - lockedDayN);
      const daysRemaining = Math.max(0, (lockedDayN + stakedDaysN) - currentDayN);
      const yieldBiNum = chain === 'pulsechain' ? PHEX_YIELD_BI_NUM : EHEX_YIELD_BI_NUM;
      const yieldBiDen = chain === 'pulsechain' ? PHEX_YIELD_BI_DEN : EHEX_YIELD_BI_DEN;
      const interestHearts = (sharesBI * BigInt(daysStakedN) * yieldBiNum) / yieldBiDen;
      const fullYieldHearts = (sharesBI * BigInt(stakedDaysN) * yieldBiNum) / yieldBiDen;
      const tShares = Number(sharesBI) / 1e12;
      const stakedHex = Number(heartsBI) / 1e8;
      const stakeHexYield = Number(fullYieldHearts) / 1e8;
      const hexPriceChainKey = `${chain}:${hexAddr.toLowerCase()}`;
      const hexChainFallback = chain === 'pulsechain' ? fetchedPrices['pulsechain:hex']?.usd : fetchedPrices.hex?.usd;
      const hexPrice = fetchedPrices[hexPriceChainKey]?.usd || hexChainFallback || 0;
      const valueUsd = stakedHex * hexPrice;
      const totalValueUsd = (Number(heartsBI + fullYieldHearts) / 1e8) * hexPrice;

      stakes.push({
        id: `${chain}-${address}-${stakeId}`,
        stakeId: Number(stakeId),
        stakedHearts: heartsBI,
        stakeShares: sharesBI,
        lockedDay: lockedDayN,
        stakedDays: stakedDaysN,
        unlockedDay: Number(unlockedDay ?? 0),
        isAutoStake: Boolean(isAutoStake),
        progress: Math.round(progress),
        estimatedValueUsd: valueUsd,
        interestHearts,
        totalValueUsd,
        chain,
        walletLabel: walletName,
        walletAddress: address.toLowerCase(),
        daysRemaining,
        tShares,
        stakedHex,
        stakeHexYield,
      });
    });
  } catch (error: any) {
    console.error(`[HEX stakes] Unexpected error on ${chain} for ${address.slice(0, 8)}...: ${error?.shortMessage ?? error?.message ?? String(error)}`);
  }

  return stakes;
}
