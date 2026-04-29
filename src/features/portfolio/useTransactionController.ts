/**
 * useTransactionController
 * ------------------------
 * Wraps syncAllWallets and exposes:
 *   - `transactions`  — normalised Transaction[] (pre-loaded from cache, updated after sync)
 *   - `isSyncing`     — true while a sync is in flight
 *   - `syncProgress`  — number of transactions collected so far in the current sync
 *   - `triggerSync()` — manually start a sync (no-op if one is already running)
 *
 * On mount the controller immediately hydrates `transactions` from the
 * transactionStore cache so the UI is never blank while the network fetch runs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as transactionStore from '../../services/transactionStore';
import type { Chain, Transaction, Wallet } from '../../types';
import { syncAllWallets } from '../transactions/syncAllWallets';

const CHAINS: Chain[] = ['pulsechain', 'ethereum', 'base'];

export interface TransactionControllerOptions {
  wallets: Wallet[];
  etherscanApiKey?: string;
}

export interface TransactionController {
  transactions: Transaction[];
  isSyncing: boolean;
  syncProgress: number;
  triggerSync: () => void;
}

export function useTransactionController({
  wallets,
  etherscanApiKey,
}: TransactionControllerOptions): TransactionController {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const isSyncingRef = useRef(false);

  // Hydrate from cache immediately on mount / when wallets change
  useEffect(() => {
    if (wallets.length === 0) {
      setTransactions([]);
      return;
    }

    const cached: Transaction[] = [];
    const seen = new Set<string>();

    for (const wallet of wallets) {
      for (const chain of CHAINS) {
        const txs = transactionStore.get(chain, wallet.address);
        for (const tx of txs) {
          if (!seen.has(tx.id)) {
            seen.add(tx.id);
            cached.push(tx);
          }
        }
      }
    }

    setTransactions(cached.sort((a, b) => b.timestamp - a.timestamp));
  }, [wallets]);

  const triggerSync = useCallback(() => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncProgress(0);

    // Cancel any previous in-flight sync
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    syncAllWallets(wallets, {
      etherscanApiKey,
      signal: controller.signal,
      onProgress: (loaded) => setSyncProgress(loaded),
    })
      .then((txs) => {
        if (!controller.signal.aborted) {
          setTransactions(txs);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.warn('useTransactionController: sync failed', err);
        }
      })
      .finally(() => {
        isSyncingRef.current = false;
        setIsSyncing(false);
      });
  }, [etherscanApiKey, wallets]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { transactions, isSyncing, syncProgress, triggerSync };
}
