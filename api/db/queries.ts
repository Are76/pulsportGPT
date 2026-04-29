import { getDb } from './client';

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export function upsertWallet(address: string, label?: string): void {
  getDb()
    .prepare(
      `INSERT INTO wallets (address, label) VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET label = excluded.label`,
    )
    .run(address, label ?? null);
}

export function deleteWallet(address: string): boolean {
  const result = getDb().prepare('DELETE FROM wallets WHERE address = ?').run(address);
  return result.changes > 0;
}

export function listWallets(): Array<{ address: string; label: string | null; created_at: number }> {
  return getDb()
    .prepare('SELECT address, label, created_at FROM wallets ORDER BY created_at DESC')
    .all() as Array<{ address: string; label: string | null; created_at: number }>;
}

// ---------------------------------------------------------------------------
// Price cache
// ---------------------------------------------------------------------------

export interface PriceCacheRow {
  price_usd: number;
  source: string;
  updated_at: number;
}

export function getCachedPrices(chain: string, tokenAddresses: string[]): Map<string, PriceCacheRow> {
  if (tokenAddresses.length === 0) return new Map();

  const placeholders = tokenAddresses.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT token_address, price_usd, source, updated_at
       FROM price_cache
       WHERE chain = ? AND token_address IN (${placeholders})`,
    )
    .all(chain, ...tokenAddresses) as Array<{ token_address: string } & PriceCacheRow>;

  const result = new Map<string, PriceCacheRow>();
  for (const row of rows) {
    result.set(row.token_address, { price_usd: row.price_usd, source: row.source, updated_at: row.updated_at });
  }
  return result;
}

export function upsertPrice(chain: string, tokenAddress: string, priceUsd: number, source: string): void {
  getDb()
    .prepare(
      `INSERT INTO price_cache (chain, token_address, price_usd, source) VALUES (?, ?, ?, ?)
       ON CONFLICT(chain, token_address) DO UPDATE
         SET price_usd = excluded.price_usd,
             source    = excluded.source,
             updated_at = unixepoch()`,
    )
    .run(chain, tokenAddress, priceUsd, source);
}

// ---------------------------------------------------------------------------
// Transaction cache
// ---------------------------------------------------------------------------

export interface TxnCacheRow {
  last_block: number;
  raw_txns: string;
  updated_at: number;
}

export function getTxnCache(chain: string, walletAddress: string): TxnCacheRow | null {
  return (getDb()
    .prepare('SELECT last_block, raw_txns, updated_at FROM txn_cache WHERE chain = ? AND wallet_address = ?')
    .get(chain, walletAddress) as TxnCacheRow | undefined) ?? null;
}

export function upsertTxnCache(chain: string, walletAddress: string, lastBlock: number, rawTxns: string): void {
  getDb()
    .prepare(
      `INSERT INTO txn_cache (chain, wallet_address, last_block, raw_txns) VALUES (?, ?, ?, ?)
       ON CONFLICT(chain, wallet_address) DO UPDATE
         SET last_block  = excluded.last_block,
             raw_txns    = excluded.raw_txns,
             updated_at  = unixepoch()`,
    )
    .run(chain, walletAddress, lastBlock, rawTxns);
}

// ---------------------------------------------------------------------------
// HEX stakes cache
// ---------------------------------------------------------------------------

export interface StakesCacheRow {
  stakes_json: string;
  updated_at: number;
}

export function getStakesCache(walletAddress: string, chain: string): StakesCacheRow | null {
  return (getDb()
    .prepare('SELECT stakes_json, updated_at FROM hex_stakes_cache WHERE wallet_address = ? AND chain = ?')
    .get(walletAddress, chain) as StakesCacheRow | undefined) ?? null;
}

export function upsertStakesCache(walletAddress: string, chain: string, stakesJson: string): void {
  getDb()
    .prepare(
      `INSERT INTO hex_stakes_cache (wallet_address, chain, stakes_json) VALUES (?, ?, ?)
       ON CONFLICT(wallet_address, chain) DO UPDATE
         SET stakes_json = excluded.stakes_json,
             updated_at  = unixepoch()`,
    )
    .run(walletAddress, chain, stakesJson);
}

// ---------------------------------------------------------------------------
// Portfolio snapshots
// ---------------------------------------------------------------------------

export function insertSnapshot(
  address: string,
  totalUsd: number,
  nativeUsd: number,
  chainDist: string,
  pnl24hUsd: number | null,
  rawSnapshot: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO portfolio_snapshots (address, total_usd, native_usd, chain_dist, pnl_24h_usd, raw_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(address, totalUsd, nativeUsd, chainDist, pnl24hUsd, rawSnapshot);
}

export interface SnapshotRow {
  captured_at: number;
  total_usd: number;
  native_usd: number;
  chain_dist: string;
  pnl_24h_usd: number | null;
}

export function getSnapshots(address: string, days: number): SnapshotRow[] {
  const since = Math.floor(Date.now() / 1000) - days * 86_400;
  return getDb()
    .prepare(
      `SELECT captured_at, total_usd, native_usd, chain_dist, pnl_24h_usd
       FROM portfolio_snapshots
       WHERE address = ? AND captured_at >= ?
       ORDER BY captured_at ASC`,
    )
    .all(address, since) as SnapshotRow[];
}

// ---------------------------------------------------------------------------
// Portfolio daily history (transaction-replay based, up to 365 days)
// ---------------------------------------------------------------------------

export interface PortfolioHistoryRow {
  date: string;
  total_usd: number;
  native_usd: number;
  chain_dist: string;
  net_flow_usd: number;
}

export function getPortfolioHistory(address: string, days: number): PortfolioHistoryRow[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return getDb()
    .prepare(
      `SELECT date, total_usd, native_usd, chain_dist, net_flow_usd
       FROM portfolio_history
       WHERE address = ? AND date >= ?
       ORDER BY date ASC`,
    )
    .all(address, since) as PortfolioHistoryRow[];
}

export function upsertPortfolioHistory(
  address: string,
  date: string,
  totalUsd: number,
  nativeUsd: number,
  chainDist: string,
  netFlowUsd: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO portfolio_history (address, date, total_usd, native_usd, chain_dist, net_flow_usd)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(address, date) DO UPDATE
         SET total_usd    = excluded.total_usd,
             native_usd   = excluded.native_usd,
             chain_dist   = excluded.chain_dist,
             net_flow_usd = excluded.net_flow_usd,
             created_at   = unixepoch()`,
    )
    .run(address, date, totalUsd, nativeUsd, chainDist, netFlowUsd);
}
