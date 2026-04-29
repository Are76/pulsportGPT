/**
 * transactionStore
 * ----------------
 * In-memory + localStorage-backed store for normalized transactions.
 *
 * Design goals:
 *   - Immediate reads from cache so the UI is never blank while incremental
 *     sync is running in the background.
 *   - Deduplication by `hash + id` (the id encodes the log-index for token
 *     transfers, so each ERC-20 event is its own entry while native-tx
 *     duplicates are still collapsed).
 *   - Cap at MAX_TXS_PER_SLOT entries per wallet+chain to keep localStorage
 *     within reasonable limits.
 *   - All public methods are synchronous so callers don't need to await I/O.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';
import type { Chain, Transaction } from '../types';

const MAX_TXS_PER_SLOT = 5_000;

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function slotKey(chain: Chain, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

function storageKey(chain: Chain, address: string): string {
  return `${STORAGE_KEYS.TX_STORE}:${slotKey(chain, address)}`;
}

// ---------------------------------------------------------------------------
// In-memory layer
// ---------------------------------------------------------------------------

const memoryStore = new Map<string, Transaction[]>();

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function persist(chain: Chain, address: string, txs: Transaction[]): void {
  try {
    localStorage.setItem(storageKey(chain, address), JSON.stringify(txs));
  } catch {
    // localStorage quota exceeded or unavailable — the in-memory store still
    // holds the data for this session.
  }
}

function loadFromStorage(chain: Chain, address: string): Transaction[] {
  try {
    const raw = localStorage.getItem(storageKey(chain, address));
    if (!raw) return [];
    return JSON.parse(raw) as Transaction[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all stored transactions for a wallet+chain.
 * Populates the in-memory slot from localStorage on first access.
 */
export function get(chain: Chain, address: string): Transaction[] {
  const key = slotKey(chain, address);
  if (!memoryStore.has(key)) {
    memoryStore.set(key, loadFromStorage(chain, address));
  }
  return memoryStore.get(key) ?? [];
}

/**
 * Merge `incoming` transactions into the existing store for this wallet+chain.
 *
 * - Deduplicates by `id` (which encodes hash + log-index).
 * - Keeps the list sorted descending by timestamp.
 * - Caps at MAX_TXS_PER_SLOT (oldest entries are dropped).
 * - Persists to localStorage after merging.
 *
 * Returns the new full list.
 */
export function append(chain: Chain, address: string, incoming: Transaction[]): Transaction[] {
  if (incoming.length === 0) return get(chain, address);

  const existing = get(chain, address);
  const seen = new Set(existing.map(tx => tx.id));
  const novel = incoming.filter(tx => !seen.has(tx.id));

  if (novel.length === 0) return existing;

  const merged = [...novel, ...existing]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_TXS_PER_SLOT);

  const key = slotKey(chain, address);
  memoryStore.set(key, merged);
  persist(chain, address, merged);
  return merged;
}

/**
 * Remove all stored transactions for a wallet+chain (memory + localStorage).
 */
export function clear(chain: Chain, address: string): void {
  const key = slotKey(chain, address);
  memoryStore.delete(key);
  try {
    localStorage.removeItem(storageKey(chain, address));
  } catch {
    // ignore
  }
}
