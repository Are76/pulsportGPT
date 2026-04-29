# PulsePort DeFi Portfolio Tracker — Architecture

## System Overview

PulsePort is a multi-chain portfolio tracker for PulseChain, Ethereum, and Base. It tracks token balances, HEX stakes, PulseX LP/farm positions, transaction history, and portfolio history with P&L.

The system is layered:

```
┌──────────────────────────────────────────────────────┐
│                   Browser (SPA)                      │
│  React + TypeScript + Vite + Tailwind CSS            │
│  – Portfolio view, stakes, LP, transactions          │
│  – localStorage for ephemeral UI state               │
└─────────────────┬────────────────────────────────────┘
                  │ HTTPS REST
┌─────────────────▼────────────────────────────────────┐
│              API Server (Node/Express)                │
│  api/server.ts — thin Express app on PORT=3001        │
│  Routes: /portfolio, /prices, /txns, /stakes, /lp    │
│  – Per-IP rate limiting (60 req/min)                  │
│  – In-memory TTL cache (Map-based)                    │
│  – SQLite persistence (WAL mode)                      │
└──────┬──────────────────┬───────────────────┬────────┘
       │                  │                   │
┌──────▼──────┐  ┌────────▼──────┐  ┌────────▼──────┐
│  PulseChain  │  │   Ethereum    │  │     Base      │
│  RPC / BS    │  │  RPC / ES     │  │  RPC / BaseSc │
└─────────────┘  └───────────────┘  └───────────────┘
       │
┌──────▼───────────────────────────────────────────────┐
│              SQLite (dev) / PostgreSQL (prod)         │
│  wallets · portfolio_snapshots · price_cache          │
│  txn_cache · hex_stakes_cache                        │
└──────────────────────────────────────────────────────┘
```

**Key design decisions:**

1. **No private keys ever** — only public EVM addresses are handled.
2. **Graceful degradation** — `src/services/apiClient.ts` returns `null` when the backend is unreachable; the frontend falls back to direct on-chain adapter calls.
3. **localStorage as L1 cache** — instant first-load; API/DB as L2; on-chain RPC as source of truth.
4. **Adapter isolation** — each chain's data fetching is behind a typed interface (`src/services/adapters/`).
5. **Formatting centralized** — all number/price rendering goes through `src/utils/format.ts`.
6. **localStorage keys centralized** — all keys come from `src/constants/storageKeys.ts`.
7. **RPC primitives shared** — `src/services/adapters/rpcUtils.ts` is the single source for batched RPC logic.

---

## File Structure

```
pulsportGPT/
├── api/                          ← backend (Node/Express)
│   ├── server.ts                 ← Express app entry point (tsx api/server.ts)
│   ├── tsconfig.json             ← Node-specific TypeScript config
│   ├── routes/
│   │   ├── portfolio.ts          ← GET /api/v1/portfolio/:address[/history]
│   │   ├── prices.ts             ← GET /api/v1/prices?chain=&tokens=
│   │   ├── transactions.ts       ← GET /api/v1/txns/:chain/:address
│   │   ├── stakes.ts             ← GET /api/v1/stakes/:address
│   │   ├── lp.ts                 ← GET /api/v1/lp/:address
│   │   └── wallets.ts            ← POST/GET/DELETE /api/v1/wallets
│   ├── middleware/
│   │   ├── cache.ts              ← Map-based TTL cache
│   │   ├── rateLimit.ts          ← per-IP sliding-window rate limiter
│   │   └── validate.ts           ← EVM address + chain param validators
│   ├── db/
│   │   ├── schema.sql            ← DDL – CREATE TABLE IF NOT EXISTS
│   │   ├── client.ts             ← better-sqlite3 singleton, auto-migrates on start
│   │   └── queries.ts            ← typed CRUD helpers for all tables
│   └── moralis/
│       └── stream.ts             ← Moralis Streams webhook handler
│
├── src/                          ← frontend SPA (unchanged except apiClient)
│   ├── services/
│   │   ├── apiClient.ts          ← NEW: typed client that calls /api/v1/*
│   │   ├── adapters/             ← chain-specific RPC adapters
│   │   ├── cache.ts              ← in-browser TTL cache
│   │   ├── dataAccess.ts         ← dependency-injection container
│   │   └── priceService.ts
│   ├── features/
│   │   ├── portfolio/            ← fetch orchestration
│   │   ├── history/
│   │   ├── app-shell/
│   │   ├── wallet-analyzer/
│   │   └── provenance/
│   ├── components/               ← UI components
│   ├── pages/                    ← page-level components
│   ├── hooks/                    ← custom React hooks
│   ├── constants/                ← STORAGE_KEYS and other constants
│   ├── utils/                    ← format.ts, fetchTransactions.ts, etc.
│   └── types.ts                  ← shared TypeScript types
│
└── docs/
    └── architecture.md           ← this file
```

---

## Database Schema

```sql
-- Public wallet addresses registered by users
CREATE TABLE wallets (
  address    TEXT PRIMARY KEY,          -- lowercase EVM address
  label      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Point-in-time portfolio snapshots for history charting
CREATE TABLE portfolio_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  address      TEXT    NOT NULL REFERENCES wallets(address),
  captured_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  total_usd    REAL    NOT NULL,
  native_usd   REAL    NOT NULL,
  chain_dist   TEXT    NOT NULL,          -- JSON: {pulsechain:N, ethereum:N, base:N}
  pnl_24h_usd  REAL,
  raw_snapshot TEXT                        -- full JSON blob for drill-down
);
CREATE INDEX idx_snap_addr_ts ON portfolio_snapshots(address, captured_at DESC);

-- Price cache keyed by (chain, token_address)
CREATE TABLE price_cache (
  chain         TEXT    NOT NULL,
  token_address TEXT    NOT NULL,
  price_usd     REAL    NOT NULL,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  source        TEXT    NOT NULL,          -- 'pulsex' | 'coingecko' | 'unpriced'
  PRIMARY KEY (chain, token_address)
);

-- Transaction cache keyed by (chain, wallet_address)
CREATE TABLE txn_cache (
  chain          TEXT    NOT NULL,
  wallet_address TEXT    NOT NULL,
  last_block     INTEGER NOT NULL DEFAULT 0,
  raw_txns       TEXT    NOT NULL DEFAULT '[]',
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (chain, wallet_address)
);

-- HEX stake snapshots
CREATE TABLE hex_stakes_cache (
  wallet_address TEXT    NOT NULL,
  chain          TEXT    NOT NULL,
  stakes_json    TEXT    NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (wallet_address, chain)
);
```

---

## API Endpoints

All endpoints are prefixed `/api/v1/`. Rate limit: 60 requests/minute per IP.

| Method   | Path                          | Query params                | Description                                  | Cache TTL |
|----------|-------------------------------|-----------------------------|----------------------------------------------|-----------|
| `GET`    | `/portfolio/:address`         | `chains` (csv)              | Token balances for requested chains          | 60 s      |
| `GET`    | `/portfolio/:address/history` | `days` (default 30)         | Array of `HistoryPoint` snapshots from DB    | 5 min     |
| `GET`    | `/prices`                     | `chain`, `tokens` (csv)     | Batch price lookup via PulseX / CoinGecko    | 30 s      |
| `GET`    | `/txns/:chain/:address`       | `startBlock`, `apiKey`      | Paginated transactions (Blockscout/Etherscan)| 2 min     |
| `GET`    | `/stakes/:address`            | `chain`                     | HEX stakes read from on-chain contract       | 5 min     |
| `GET`    | `/lp/:address`                | —                           | PulseX LP positions via subgraph             | 60 s      |
| `POST`   | `/wallets`                    | body: `{address, label?}`   | Register a wallet address                    | —         |
| `GET`    | `/wallets`                    | —                           | List all registered wallets                  | —         |
| `DELETE` | `/wallets/:address`           | —                           | Remove a wallet registration                 | —         |

### Success envelope
```json
{ "ok": true, "data": { "..." }, "cachedAt": 1714393200, "ttlRemaining": 45 }
```

### Error envelope
```json
{ "ok": false, "error": "INVALID_ADDRESS", "message": "Must be a valid EVM address" }
```

---

## Running the server

```bash
# Development
npx tsx api/server.ts

# Or via npm script
npm run server
```

Set the following environment variables (see `.env.example`):

| Variable           | Default                        | Description                         |
|--------------------|--------------------------------|-------------------------------------|
| `PORT`             | `3001`                         | HTTP port for the API server        |
| `DB_URL`           | `./data/pulseport.db`          | Path to the SQLite database file    |
| `CACHE_TTL_S`      | per-route defaults             | Override default cache TTL (seconds)|

---

## Scalability path (Phase 2)

- Swap `better-sqlite3` for `pg` (PostgreSQL) — only `api/db/client.ts` changes
- Add a Redis-backed cache layer replacing the in-memory Map
- Add a background cron job (`node-cron`) to refresh portfolio snapshots every 15 min
- Add WebSocket push for real-time price updates
- Add multi-user session support (wallet registry per session/auth token)
