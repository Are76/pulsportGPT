/**
 * syncWalletTransactions
 * ----------------------
 * Orchestrates incremental transaction sync for a single wallet+chain:
 *
 *  1. Read the persisted SyncCursor from localStorage.
 *  2. Call fetchTransactionPage with startBlock = cursor.lastBlock.
 *  3. Append the new transactions to transactionStore (dedup + sort).
 *  4. Update the cursor to nextBlock.
 *  5. Emit progress via the optional onProgress callback.
 *
 * Returns the full merged transaction list after the sync completes.
 */

import { getCursor, setCursor } from '../../services/syncCursor';
import * as transactionStore from '../../services/transactionStore';
import type { Chain, Transaction } from '../../types';
import { fetchTransactionPage } from './fetchTransactionPage';

export interface SyncWalletTransactionsOptions {
  /** Etherscan API key used when chain === 'ethereum'. */
  etherscanApiKey?: string;
  /** AbortSignal — if aborted the function resolves with whatever was fetched so far. */
  signal?: AbortSignal;
  /** Called after each page is appended; `loaded` = txs seen so far. */
  onProgress?: (loaded: number) => void;
}

export async function syncWalletTransactions(
  chain: Chain,
  address: string,
  options: SyncWalletTransactionsOptions = {},
): Promise<Transaction[]> {
  const { etherscanApiKey, signal, onProgress } = options;
  const addr = address.toLowerCase();

  const cursor = getCursor(chain, addr);
  const startBlock = cursor?.lastBlock ?? 0;

  if (signal?.aborted) return transactionStore.get(chain, addr);

  let page;
  try {
    page = await fetchTransactionPage(chain, addr, { startBlock, etherscanApiKey });
  } catch (err) {
    console.warn(`syncWalletTransactions: fetch failed for ${chain}:${addr}`, err);
    return transactionStore.get(chain, addr);
  }

  if (signal?.aborted) return transactionStore.get(chain, addr);

  // Stamp walletAddress on each transaction for multi-wallet filtering
  const stamped = page.transactions.map(tx => ({ ...tx, walletAddress: addr }));

  const merged = transactionStore.append(chain, addr, stamped);
  onProgress?.(merged.length);

  // Persist cursor so the next session resumes from here
  if (page.nextBlock !== null) {
    setCursor({ chain, address: addr, lastBlock: page.nextBlock, fetchedAt: Date.now() });
  } else {
    // All history fetched — record a cursor with the highest block we saw
    const highestBlock = stamped.reduce(
      (max, tx) => (tx.blockNumber !== undefined ? Math.max(max, tx.blockNumber) : max),
      startBlock,
    );
    setCursor({ chain, address: addr, lastBlock: highestBlock, fetchedAt: Date.now() });
  }

  return merged;
}
