/**
 * Demonstration data shown when no wallets have been added.
 * Kept outside App.tsx to reduce bundle weight and cognitive load.
 */

import type { Asset, Chain, HexStake, HistoryPoint, Transaction } from '../types';

export const MOCK_ASSETS: Asset[] = [
  { id: 'pls', symbol: 'PLS', name: 'PulseChain', balance: 1250000, price: 0.000065, value: 81.25, chain: 'pulsechain', pnl24h: 5.4 },
  { id: 'plsx', symbol: 'PLSX', name: 'PulseX', balance: 5000000, price: 0.000032, value: 160, chain: 'pulsechain', pnl24h: -2.1 },
  { id: 'ehex', symbol: 'eHEX', name: 'HEX (from Ethereum)', balance: 250000, price: 0.004, value: 1000, chain: 'pulsechain', pnl24h: 8.2 },
  { id: 'pdai', symbol: 'pDAI', name: 'DAI (System Copy)', balance: 10000, price: 0.00189, value: 18.9, chain: 'pulsechain', pnl24h: -1.5 },
  { id: 'inc', symbol: 'INC', name: 'Incentive', balance: 50, price: 5.20, value: 260, chain: 'pulsechain', pnl24h: 12.4 },
  { id: 'prvx', symbol: 'PRVX', name: 'PrivacyX', balance: 1000, price: 0.15, value: 150, chain: 'pulsechain', pnl24h: 0 },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', balance: 1.5, price: 3450, value: 5175, chain: 'ethereum', pnl24h: 1.2 },
  { id: 'hex-p', symbol: 'HEX', name: 'HEX (PulseChain)', balance: 100000, price: 0.004, value: 400, chain: 'pulsechain', pnl24h: 12.5 },
  { id: 'hex-e', symbol: 'HEX', name: 'HEX (Ethereum)', balance: 50000, price: 0.0035, value: 175, chain: 'ethereum', pnl24h: -0.5 },
  { id: 'usdc-b', symbol: 'USDC', name: 'USD Coin (Base)', balance: 2500, price: 1, value: 2500, chain: 'base', pnl24h: 0.01 },
];

export const MOCK_STAKES: HexStake[] = [
  {
    id: 'mock-1',
    stakeId: 1,
    stakedHearts: 100000000000n,
    stakeShares: 5000000000000n,
    lockedDay: 1500,
    stakedDays: 365,
    unlockedDay: 1865,
    isAutoStake: false,
    progress: 45,
    estimatedValueUsd: 1200,
    chain: 'pulsechain',
  },
  {
    id: 'mock-2',
    stakeId: 2,
    stakedHearts: 500000000000n,
    stakeShares: 25000000000000n,
    lockedDay: 1200,
    stakedDays: 5555,
    unlockedDay: 6755,
    isAutoStake: false,
    progress: 12,
    estimatedValueUsd: 8500,
    chain: 'ethereum',
  },
];

export const MOCK_HISTORY: HistoryPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const baseValue = 8000;
  const randomFluc = Math.sin(i * 0.5) * 500 + Math.random() * 200;
  const value = baseValue + randomFluc + i * 50;

  const chainPnl: Record<Chain, number> = {
    pulsechain: randomFluc * 0.6 + (Math.random() * 100 - 50),
    ethereum: randomFluc * 0.3 + (Math.random() * 100 - 50),
    base: randomFluc * 0.1 + (Math.random() * 50 - 25),
  };

  return {
    timestamp: date.getTime(),
    value,
    nativeValue: value / 0.000065,
    pnl: randomFluc,
    chainPnl,
  };
});

const MOCK_WALLET = '0xdemo0000000000000000000000000000000001';

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'm1', hash: '0x123...', timestamp: Date.now() - 86400000 * 2, type: 'deposit', from: '0xabc...', to: MOCK_WALLET, asset: 'ETH', amount: 1.5, chain: 'ethereum', valueUsd: 5175 },
  { id: 'm2', hash: '0x456...', timestamp: Date.now() - 86400000 * 5, type: 'deposit', from: '0xdef...', to: MOCK_WALLET, asset: 'USDC', amount: 2500, chain: 'base', valueUsd: 2500 },
  { id: 'm-bridge-1', hash: '0xb1d9e001...', timestamp: Date.now() - 86400000 * 1.25, type: 'deposit', from: '0xbridge...', to: MOCK_WALLET, asset: 'DAI (from Ethereum)', amount: 1250, chain: 'pulsechain', valueUsd: 1248.5, bridged: true, status: 'Confirmed' },
  { id: 'm-bridge-2', hash: '0xb1d9e002...', timestamp: Date.now() - 86400000 * 6.5, type: 'deposit', from: '0xbridge...', to: MOCK_WALLET, asset: 'WETH (from Ethereum)', amount: 0.42, chain: 'pulsechain', valueUsd: 1449, bridged: true, status: 'Confirmed' },
  { id: 'm3', hash: '0x789...', timestamp: Date.now() - 86400000 * 10, type: 'swap', from: MOCK_WALLET, to: MOCK_WALLET, asset: 'ETH', amount: 0.5, chain: 'ethereum', valueUsd: 1725, counterAsset: 'USDC', counterAmount: 1725 },
  { id: 'm4', hash: '0xabc...', timestamp: Date.now() - 86400000 * 15, type: 'deposit', from: '0xghi...', to: MOCK_WALLET, asset: 'ETH', amount: 2.0, chain: 'ethereum', valueUsd: 6800 },
  { id: 'm5', hash: '0xdef...', timestamp: Date.now() - 86400000 * 20, type: 'deposit', from: '0xjkl...', to: MOCK_WALLET, asset: 'USDC', amount: 5000, chain: 'ethereum', valueUsd: 5000 },
  { id: 'm6', hash: '0x000...', timestamp: Date.now() - 86400000 * 1, type: 'deposit', from: '0x000...', to: MOCK_WALLET, asset: 'USDC', amount: 1000, chain: 'ethereum', valueUsd: 1000 },
  { id: 'm7', hash: '0x999...', timestamp: Date.now() - 86400000 * 0.5, type: 'deposit', from: '0x123...', to: MOCK_WALLET, asset: 'USDC', amount: 25000, chain: 'ethereum', valueUsd: 25000 },
];
