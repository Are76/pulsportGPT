/**
 * syncAllWallets
 * --------------
 * Fans out syncWalletTransactions across all wallet × chain combinations with
 * bounded concurrency (max MAX_CONCURRENT fetches at a time) to avoid hitting
 * upstream rate limits.
 *
 * Accepts an AbortSignal so callers can cancel in-flight syncs when the
 * component unmounts or a new sync is triggered.
 *
 * Returns a flat, deduplicated, timestamp-sorted Transaction[] covering all
 * wallets and chains.
 */

import type { Chain, Transaction, Wallet } from '../../types';
import { syncWalletTransactions } from './syncWalletTransactions';

const MAX_CONCURRENT = 3;
const CHAINS: Chain[] = ['pulsechain', 'ethereum', 'base'];

export interface SyncAllWalletsOptions {
  /** Etherscan API key used when fetching Ethereum transactions. */
  etherscanApiKey?: string;
  /** AbortSignal — all pending fetches are skipped when aborted. */
  signal?: AbortSignal;
  /** Called after each wallet+chain finishes; `loaded` = total txs collected. */
  onProgress?: (loaded: number) => void;
}

export async function syncAllWallets(
  wallets: Wallet[],
  options: SyncAllWalletsOptions = {},
): Promise<Transaction[]> {
  const { etherscanApiKey, signal, onProgress } = options;

  // Build the full list of (chain, address) pairs to sync
  type Slot = { chain: Chain; address: string };
  const slots: Slot[] = wallets.flatMap(w =>
    CHAINS.map(chain => ({ chain, address: w.address })),
  );

  // Collect all transactions across all slots; deduplicate by id
  const allById = new Map<string, Transaction>();
  let runningCount = 0;

  // Process slots with bounded concurrency using a semaphore pattern
  const queue = [...slots];
  const workers: Promise<void>[] = [];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      if (signal?.aborted) return;

      const slot = queue.shift();
      if (!slot) return;

      try {
        const txs = await syncWalletTransactions(slot.chain, slot.address, {
          etherscanApiKey,
          signal,
        });

        for (const tx of txs) {
          allById.set(tx.id, tx);
        }

        runningCount = allById.size;
        onProgress?.(runningCount);
      } catch (err) {
        console.warn(`syncAllWallets: slot ${slot.chain}:${slot.address} failed`, err);
      }
    }
  }

  // Spawn up to MAX_CONCURRENT workers
  for (let i = 0; i < Math.min(MAX_CONCURRENT, slots.length); i++) {
    workers.push(processNext());
  }

  await Promise.allSettled(workers);

  // Return deduplicated list sorted descending by timestamp
  return Array.from(allById.values()).sort((a, b) => b.timestamp - a.timestamp);
}
