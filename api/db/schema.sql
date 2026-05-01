-- Tracks user-registered wallets (public addresses only, no keys)
CREATE TABLE IF NOT EXISTS wallets (
  address    TEXT PRIMARY KEY,
  label      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Point-in-time portfolio snapshots for history charting
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  address      TEXT    NOT NULL REFERENCES wallets(address),
  captured_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  total_usd    REAL    NOT NULL,
  native_usd   REAL    NOT NULL,
  chain_dist   TEXT    NOT NULL,
  pnl_24h_usd  REAL,
  raw_snapshot TEXT
);

CREATE INDEX IF NOT EXISTS idx_snap_addr_ts ON portfolio_snapshots(address, captured_at DESC);

-- Price cache keyed by (chain, token_address)
CREATE TABLE IF NOT EXISTS price_cache (
  chain         TEXT NOT NULL,
  token_address TEXT NOT NULL,
  price_usd     REAL NOT NULL,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  source        TEXT NOT NULL,
  PRIMARY KEY (chain, token_address)
);

-- Transaction cache keyed by (chain, wallet_address)
CREATE TABLE IF NOT EXISTS txn_cache (
  chain          TEXT    NOT NULL,
  wallet_address TEXT    NOT NULL,
  last_block     INTEGER NOT NULL DEFAULT 0,
  raw_txns       TEXT    NOT NULL DEFAULT '[]',
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (chain, wallet_address)
);

-- HEX stake snapshots
CREATE TABLE IF NOT EXISTS hex_stakes_cache (
  wallet_address TEXT    NOT NULL,
  chain          TEXT    NOT NULL,
  stakes_json    TEXT    NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (wallet_address, chain)
);

-- Daily portfolio history for transaction-replay reconstruction (up to 365 days)
CREATE TABLE IF NOT EXISTS portfolio_history (
  address        TEXT    NOT NULL,
  date           TEXT    NOT NULL,   -- ISO date YYYY-MM-DD (UTC)
  total_usd      REAL    NOT NULL,
  native_usd     REAL    NOT NULL DEFAULT 0,
  chain_dist     TEXT    NOT NULL DEFAULT '{}',
  net_flow_usd   REAL    NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (address, date)
);

CREATE INDEX IF NOT EXISTS idx_ph_addr_date ON portfolio_history(address, date DESC);
