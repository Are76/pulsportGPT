import type { FarmPosition, LpPosition } from '../../types';

type PriceMap = Record<string, { usd?: number } | undefined>;
type FetchLike = typeof fetch;

const LP_PAIR_META: Record<string, { name: string; token0: string; token0Sym: string; token0Dec: number; token1: string; token1Sym: string; token1Dec: number }> = {
  '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9': { name: 'PLSX/WPLS', token0: '0x95b303987a60c71504d99aa1b13b4da07b0790ab', token0Sym: 'PLSX', token0Dec: 18, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa': { name: 'INC/WPLS', token0: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', token0Sym: 'INC', token0Dec: 18, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65': { name: 'pHEX/WPLS', token0: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', token0Sym: 'HEX', token0Dec: 8, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0x42abdfdb63f3282033c766e72cc4810738571609': { name: 'WETH/WPLS', token0: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', token0Sym: 'WETH', token0Dec: 18, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0xdb82b0919584124a0eb176ab136a0cc9f148b2d1': { name: 'WPLS/WBTC', token0: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token0Sym: 'WPLS', token0Dec: 18, token1: '0xb17d901469b9208b17d916112988a3fed19b5ca1', token1Sym: 'WBTC', token1Dec: 8 },
  '0xe56043671df55de5cdf8459710433c10324de0ae': { name: 'WPLS/DAI', token0: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token0Sym: 'WPLS', token0Dec: 18, token1: '0xefd766ccb38eaf1dfd701853bfce31359239f305', token1Sym: 'DAI', token1Dec: 18 },
  '0x6753560538eca67617a9ce605178f788be7e524e': { name: 'USDC/WPLS', token0: '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', token0Sym: 'USDC', token0Dec: 6, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0x322df7921f28f1146cdf62afdac0d6bc0ab80711': { name: 'USDT/WPLS', token0: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', token0Sym: 'USDT', token0Dec: 6, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
};

const FARM_PAIR_META: Record<string, { name: string; token0: string; token0Sym: string; token0Dec: number; token1: string; token1Sym: string; token1Dec: number }> = {
  '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9': { name: 'PLSX/WPLS', token0: '0x95b303987a60c71504d99aa1b13b4da07b0790ab', token0Sym: 'PLSX', token0Dec: 18, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa': { name: 'INC/WPLS', token0: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', token0Sym: 'INC', token0Dec: 18, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65': { name: 'pHEX/WPLS', token0: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', token0Sym: 'HEX', token0Dec: 8, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0x42abdfdb63f3282033c766e72cc4810738571609': { name: 'WETH/WPLS', token0: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', token0Sym: 'WETH', token0Dec: 18, token1: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token1Sym: 'WPLS', token1Dec: 18 },
  '0xdb82b0919584124a0eb176ab136a0cc9f148b2d1': { name: 'WPLS/WBTC', token0: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', token0Sym: 'WPLS', token0Dec: 18, token1: '0xb17d901469b9208b17d916112988a3fed19b5ca1', token1Sym: 'WBTC', token1Dec: 8 },
};

export async function loadPulsechainLpPositions(
  rpcUrl: string,
  walletAddrs: string[],
  fetchedPrices: PriceMap,
  fetchImpl: FetchLike = fetch,
): Promise<LpPosition[]> {
  const lpAddrs = Object.keys(LP_PAIR_META);
  const SEL_RESERVES = '0x0902f1ac';
  const SEL_TOTAL_SUP = '0x18160ddd';
  const SEL_BAL_OF = '0x70a08231';
  const padAddr = (address: string) => `000000000000000000000000${address.replace('0x', '').toLowerCase()}`;

  const lpBatch: any[] = [];
  let batchId = 0;
  const lpBatchMeta: { pairAddr: string; type: 'reserves' | 'supply' | 'balance'; walletAddr?: string; id: number }[] = [];

  lpAddrs.forEach((pairAddr) => {
    lpBatch.push({ jsonrpc: '2.0', id: batchId, method: 'eth_call', params: [{ to: pairAddr, data: SEL_RESERVES }, 'latest'] });
    lpBatchMeta.push({ pairAddr, type: 'reserves', id: batchId++ });
    lpBatch.push({ jsonrpc: '2.0', id: batchId, method: 'eth_call', params: [{ to: pairAddr, data: SEL_TOTAL_SUP }, 'latest'] });
    lpBatchMeta.push({ pairAddr, type: 'supply', id: batchId++ });
    walletAddrs.forEach((walletAddr) => {
      lpBatch.push({ jsonrpc: '2.0', id: batchId, method: 'eth_call', params: [{ to: pairAddr, data: SEL_BAL_OF + padAddr(walletAddr) }, 'latest'] });
      lpBatchMeta.push({ pairAddr, type: 'balance', walletAddr, id: batchId++ });
    });
  });

  if (lpBatch.length === 0) return [];

  const response = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lpBatch),
  });
  const lpResults: any[] = await response.json();
  lpResults.sort((a, b) => a.id - b.id);

  const lpData: Record<string, { reserve0: bigint; reserve1: bigint; totalSupply: bigint; balances: Record<string, bigint> }> = {};
  lpAddrs.forEach((address) => {
    lpData[address] = { reserve0: 0n, reserve1: 0n, totalSupply: 0n, balances: {} };
  });

  lpResults.forEach((result) => {
    const meta = lpBatchMeta[result.id];
    if (!meta || !result.result || result.result === '0x') return;
    const hex = result.result.replace('0x', '').padStart(192, '0');
    if (meta.type === 'reserves') {
      lpData[meta.pairAddr].reserve0 = BigInt(`0x${hex.slice(0, 64)}`);
      lpData[meta.pairAddr].reserve1 = BigInt(`0x${hex.slice(64, 128)}`);
    } else if (meta.type === 'supply') {
      lpData[meta.pairAddr].totalSupply = BigInt(`0x${result.result.replace('0x', '').padStart(64, '0')}`);
    } else if (meta.walletAddr) {
      lpData[meta.pairAddr].balances[meta.walletAddr] = BigInt(`0x${result.result.replace('0x', '').padStart(64, '0')}`);
    }
  });

  const wplsUSD = fetchedPrices['pulsechain']?.usd || fetchedPrices['pulsechain:native']?.usd || 0;
  const positions: LpPosition[] = [];

  lpAddrs.forEach((pairAddr) => {
    const data = lpData[pairAddr];
    const meta = LP_PAIR_META[pairAddr];
    if (!data || data.totalSupply === 0n) return;

    const totalUserBal = walletAddrs.reduce((sum, walletAddr) => sum + (data.balances[walletAddr] ?? 0n), 0n);
    if (totalUserBal === 0n) return;

    const userShare = (totalUserBal * BigInt(1e18)) / data.totalSupply;
    const tok0Raw = (data.reserve0 * userShare) / BigInt(1e18);
    const tok1Raw = (data.reserve1 * userShare) / BigInt(1e18);
    const token0Amount = Number(tok0Raw) / Math.pow(10, meta.token0Dec);
    const token1Amount = Number(tok1Raw) / Math.pow(10, meta.token1Dec);
    const token0PriceKey = `pulsechain:${meta.token0}`;
    const token1PriceKey = `pulsechain:${meta.token1}`;
    const token0Usd = token0Amount * (fetchedPrices[token0PriceKey]?.usd || fetchedPrices[meta.token0]?.usd || (meta.token0Sym === 'WPLS' ? wplsUSD : 0));
    const token1Usd = token1Amount * (fetchedPrices[token1PriceKey]?.usd || fetchedPrices[meta.token1]?.usd || (meta.token1Sym === 'WPLS' ? wplsUSD : 0));

    positions.push({
      pairAddress: pairAddr,
      pairName: meta.name,
      token0Address: meta.token0,
      token1Address: meta.token1,
      token0Symbol: meta.token0Sym,
      token1Symbol: meta.token1Sym,
      token0Decimals: meta.token0Dec,
      token1Decimals: meta.token1Dec,
      token0Amount,
      token1Amount,
      token0Usd,
      token1Usd,
      totalUsd: token0Usd + token1Usd,
      lpBalance: Number(totalUserBal) / 1e18,
    });
  });

  return positions.sort((a, b) => b.totalUsd - a.totalUsd);
}

export async function loadPulsechainFarmPositions(
  rpcUrl: string,
  walletAddrs: string[],
  fetchedPrices: PriceMap,
  fetchImpl: FetchLike = fetch,
): Promise<FarmPosition[]> {
  const MASTERCHEF = '0xb2ca4a66d3e57a5a9a12043b6bad28249fe302d4';
  const poolLenResponse = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'eth_call', params: [{ to: MASTERCHEF, data: '0x081e3eda' }, 'latest'] }),
  });
  const poolLenData = await poolLenResponse.json();
  const poolLength = parseInt(poolLenData.result, 16);
  if (!poolLength || poolLength === 0) return [];

  const SEL_POOL_INFO = '0x1526fe27';
  const SEL_USER_INFO = '0x93f1a40b';
  const SEL_PENDING = '0xf40f0f52';
  const padN = (value: number) => value.toString(16).padStart(64, '0');
  const padA = (address: string) => `000000000000000000000000${address.replace('0x', '').toLowerCase()}`;

  const farmBatch: any[] = [];
  let batchId = 0;
  type FarmMeta = { type: 'pool'; poolIdx: number; id: number } | { type: 'user' | 'pending'; poolIdx: number; wallet: string; id: number };
  const farmMeta: FarmMeta[] = [];

  for (let poolIdx = 0; poolIdx < poolLength; poolIdx += 1) {
    farmBatch.push({ jsonrpc: '2.0', id: batchId, method: 'eth_call', params: [{ to: MASTERCHEF, data: SEL_POOL_INFO + padN(poolIdx) }, 'latest'] });
    farmMeta.push({ type: 'pool', poolIdx, id: batchId++ });
    walletAddrs.forEach((walletAddr) => {
      farmBatch.push({ jsonrpc: '2.0', id: batchId, method: 'eth_call', params: [{ to: MASTERCHEF, data: SEL_USER_INFO + padN(poolIdx) + padA(walletAddr) }, 'latest'] });
      farmMeta.push({ type: 'user', poolIdx, wallet: walletAddr, id: batchId++ });
      farmBatch.push({ jsonrpc: '2.0', id: batchId, method: 'eth_call', params: [{ to: MASTERCHEF, data: SEL_PENDING + padN(poolIdx) + padA(walletAddr) }, 'latest'] });
      farmMeta.push({ type: 'pending', poolIdx, wallet: walletAddr, id: batchId++ });
    });
  }

  const CHUNK = 50;
  const farmResults: any[] = [];
  for (let index = 0; index < farmBatch.length; index += CHUNK) {
    const chunk = farmBatch.slice(index, index + CHUNK);
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    const data: any[] = await response.json();
    farmResults.push(...data);
  }
  farmResults.sort((a, b) => a.id - b.id);

  const poolLpAddresses: Record<number, string> = {};
  const userStaked: Record<number, Record<string, bigint>> = {};
  const userPending: Record<number, Record<string, bigint>> = {};

  farmResults.forEach((result) => {
    const meta = farmMeta[result.id];
    if (!meta || !result.result || result.result === '0x') return;
    const hex = result.result.replace('0x', '');
    if (meta.type === 'pool') {
      poolLpAddresses[meta.poolIdx] = `0x${hex.slice(24, 64)}`.toLowerCase();
    } else if (meta.type === 'user') {
      if (!userStaked[meta.poolIdx]) userStaked[meta.poolIdx] = {};
      userStaked[meta.poolIdx][meta.wallet] = BigInt(`0x${hex.slice(0, 64)}`);
    } else {
      if (!userPending[meta.poolIdx]) userPending[meta.poolIdx] = {};
      userPending[meta.poolIdx][meta.wallet] = BigInt(`0x${hex.slice(0, 64)}`);
    }
  });

  const incPriceUsd = fetchedPrices['pulsechain:0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d']?.usd || 0;
  const wplsUSD = fetchedPrices['pulsechain']?.usd || 0;
  const positions: FarmPosition[] = [];

  Object.entries(poolLpAddresses).forEach(([poolIdxStr, lpAddr]) => {
    const poolIdx = Number(poolIdxStr);
    const pairMeta = FARM_PAIR_META[lpAddr];
    if (!pairMeta) return;

    const totalStaked = walletAddrs.reduce((sum, walletAddr) => sum + (userStaked[poolIdx]?.[walletAddr] ?? 0n), 0n);
    const totalPending = walletAddrs.reduce((sum, walletAddr) => sum + (userPending[poolIdx]?.[walletAddr] ?? 0n), 0n);
    if (totalStaked === 0n) return;

    const stakedLp = Number(totalStaked) / 1e18;
    const pendingInc = Number(totalPending) / 1e18;
    const token0PriceKey = `pulsechain:${pairMeta.token0}`;
    const token1PriceKey = `pulsechain:${pairMeta.token1}`;
    const token0Usd = fetchedPrices[token0PriceKey]?.usd || (pairMeta.token0Sym === 'WPLS' ? wplsUSD : 0);
    const token1Usd = fetchedPrices[token1PriceKey]?.usd || (pairMeta.token1Sym === 'WPLS' ? wplsUSD : 0);

    positions.push({
      poolId: poolIdx,
      lpAddress: lpAddr,
      pairName: pairMeta.name,
      token0Symbol: pairMeta.token0Sym,
      token1Symbol: pairMeta.token1Sym,
      token0Address: pairMeta.token0,
      token1Address: pairMeta.token1,
      stakedLp,
      token0Amount: 0,
      token1Amount: 0,
      token0Usd: 0,
      token1Usd: 0,
      totalUsd: stakedLp * 2 * Math.min(token0Usd, token1Usd || token0Usd),
      pendingInc,
      pendingIncUsd: pendingInc * incPriceUsd,
    });
  });

  return positions.sort((a, b) => b.totalUsd - a.totalUsd);
}
