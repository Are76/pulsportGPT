/**
 * Module-level Viem public client singletons.
 *
 * Creating clients once (at module load) instead of on every portfolio refresh
 * preserves the fallback-transport rank-learning state across fetches.
 */
import { createPublicClient, fallback, http } from 'viem';
import { CHAINS } from '../constants';

const makeTransports = (config: { rpc: string; fallbackRpcs?: string[] }) => [
  http(config.rpc),
  ...(config.fallbackRpcs ?? []).map((rpc) => http(rpc)),
];

export const ethereumClient = createPublicClient({
  transport: fallback(makeTransports(CHAINS.ethereum), { rank: true }),
});

export const pulsechainClient = createPublicClient({
  transport: fallback(makeTransports(CHAINS.pulsechain), { rank: true }),
});

export const baseClient = createPublicClient({
  transport: fallback(
    makeTransports({ rpc: CHAINS.base.rpc }),
    { rank: true },
  ),
});

export const CHAIN_CLIENTS = {
  ethereum: ethereumClient,
  pulsechain: pulsechainClient,
  base: baseClient,
} as const;
