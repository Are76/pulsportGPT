/**
 * fetchTransactionPage
 * --------------------
 * Thin wrapper around the three chain-specific fetchers that normalises their
 * output into the unified `TransactionPage` type.
 *
 * Single responsibility: fetch ONE page of raw transactions for ONE wallet on
 * ONE chain and return a `TransactionPage`.  All caching/persistence is handled
 * by the callers (syncWalletTransactions / transactionStore).
 */

import {
  fetchBaseTransactions,
  fetchEthereumTransactions,
  fetchPulsechainTransactions,
} from '../../utils/fetchTransactions';
import type { Chain, TransactionPage } from '../../types';

export interface FetchTransactionPageOptions {
  /** Resume from this block number (exclusive lower bound). */
  startBlock?: number;
  /** Etherscan API key (required for Ethereum on public rate-limits). */
  etherscanApiKey?: string;
}

/**
 * Fetch a page of transactions for `address` on `chain`.
 *
 * Returns a `TransactionPage` with:
 *   - `transactions` — normalised Transaction[] for this page
 *   - `nextBlock` — block to pass as `startBlock` on the next call, or `null`
 *     when the full history has been fetched
 *   - `isTruncated` — true when the underlying fetcher stopped early (e.g.
 *     max-pages guard)
 */
export async function fetchTransactionPage(
  chain: Chain,
  address: string,
  options: FetchTransactionPageOptions = {},
): Promise<TransactionPage> {
  const { startBlock, etherscanApiKey } = options;

  if (chain === 'pulsechain') {
    const result = await fetchPulsechainTransactions(address, { startBlock });
    return {
      transactions: result.transactions,
      nextBlock: result.nextBlock ?? null,
      isTruncated: false,
    };
  }

  if (chain === 'base') {
    const result = await fetchBaseTransactions(address, { startBlock });
    return {
      transactions: result.transactions,
      nextBlock: result.nextBlock ?? null,
      isTruncated: false,
    };
  }

  if (chain === 'ethereum') {
    const result = await fetchEthereumTransactions(address, {
      startBlock,
      apiKey: etherscanApiKey,
    });
    return {
      transactions: result.transactions,
      nextBlock: result.nextBlock ?? null,
      isTruncated: false,
    };
  }

  // Should never be reached but satisfies exhaustiveness
  throw new Error(`fetchTransactionPage: unsupported chain "${chain}"`);
}
