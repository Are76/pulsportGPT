/**
 * syncCursor
 * ----------
 * Reads and writes SyncCursor objects to localStorage so that incremental
 * transaction sync can resume from the last seen block across page reloads.
 *
 * All cursors are stored as a single JSON map under STORAGE_KEYS.SYNC_CURSORS,
 * keyed by `${chain}:${address}`.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';
import type { Chain, SyncCursor } from '../types';

function cursorKey(chain: Chain, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

function readAll(): Record<string, SyncCursor> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_CURSORS);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SyncCursor>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, SyncCursor>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_CURSORS, JSON.stringify(map));
  } catch {
    // localStorage quota exceeded or unavailable — swallow silently
  }
}

export function getCursor(chain: Chain, address: string): SyncCursor | null {
  const map = readAll();
  return map[cursorKey(chain, address)] ?? null;
}

export function setCursor(cursor: SyncCursor): void {
  const map = readAll();
  map[cursorKey(cursor.chain, cursor.address)] = cursor;
  writeAll(map);
}

export function clearCursor(chain: Chain, address: string): void {
  const map = readAll();
  delete map[cursorKey(chain, address)];
  writeAll(map);
}
