/**
 * Typed HTTP client for the PulsePort backend API (/api/v1/*).
 *
 * Every function returns `null` when the backend is unreachable or returns an
 * error response, allowing callers to fall back to direct on-chain adapter
 * calls transparently.
 */

const BASE = '/api/v1';

// ---------------------------------------------------------------------------
// Shared types that mirror the API response envelopes
// ---------------------------------------------------------------------------

interface ApiOk<T> {
  ok: true;
  data: T;
  cachedAt: number;
  ttlRemaining: number;
}

interface ApiError {
  ok: false;
  error: string;
  message: string;
}

type ApiResponse<T> = ApiOk<T> | ApiError;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResponse<T>;
    if (!json.ok) return null;
    return json.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export interface ApiTokenBalance {
  symbol: string;
  address: string;
  balance: number;
  decimals: number;
}

export interface ApiChainData {
  nativeBalance: number;
  nativeSymbol: string;
  tokens: ApiTokenBalance[];
}

export interface ApiPortfolio {
  address: string;
  chains: Record<string, ApiChainData | { error: string }>;
}

export function fetchPortfolio(address: string, chains?: string[]): Promise<ApiPortfolio | null> {
  const chainsParam = chains ? `?chains=${chains.join(',')}` : '';
  return apiFetch<ApiPortfolio>(`${BASE}/portfolio/${address}${chainsParam}`);
}

// ---------------------------------------------------------------------------
// Portfolio history
// ---------------------------------------------------------------------------

export interface ApiHistoryPoint {
  timestamp: number;
  totalUsd: number;
  nativeUsd: number;
  chainDist: Record<string, number>;
  pnl24hUsd: number | null;
}

export function fetchPortfolioHistory(address: string, days = 30): Promise<ApiHistoryPoint[] | null> {
  return apiFetch<ApiHistoryPoint[]>(`${BASE}/portfolio/${address}/history?days=${days}`);
}

// ---------------------------------------------------------------------------
// Portfolio P&L (server-side FIFO)
// ---------------------------------------------------------------------------

export interface ApiPortfolioPnl {
  address: string;
  realizedGainUsd: number;
  unrealizedCostBasisUsd: number;
  unrealizedGainUsd: number;
  costBasisUsd: number;
}

export function fetchPortfolioPnl(address: string): Promise<ApiPortfolioPnl | null> {
  return apiFetch<ApiPortfolioPnl>(`${BASE}/portfolio/${address}/pnl`);
}

// ---------------------------------------------------------------------------
// Portfolio history upsert (called after each frontend refresh)
// ---------------------------------------------------------------------------

export interface UpsertHistoryPayload {
  date: string;
  totalUsd: number;
  nativeUsd: number;
  chainDist?: Record<string, number>;
  netFlowUsd?: number;
}

export function upsertPortfolioHistoryPoint(
  address: string,
  payload: UpsertHistoryPayload,
): Promise<{ address: string; date: string } | null> {
  return apiFetch<{ address: string; date: string }>(`${BASE}/portfolio/${address}/history`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export interface ApiPrices {
  chain: string;
  prices: Record<string, number>;
}

export function fetchPrices(chain: string, tokenAddresses: string[]): Promise<ApiPrices | null> {
  if (tokenAddresses.length === 0) return Promise.resolve(null);
  const tokens = tokenAddresses.join(',');
  return apiFetch<ApiPrices>(`${BASE}/prices?chain=${chain}&tokens=${tokens}`);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface ApiTransaction {
  hash: string;
  timestamp: number;
  type: 'in' | 'out';
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  chain: string;
  blockNumber: number;
}

export interface ApiTransactions {
  chain: string;
  address: string;
  transactions: ApiTransaction[];
}

export function fetchTransactions(
  chain: string,
  address: string,
  startBlock?: number,
  etherscanApiKey?: string,
): Promise<ApiTransactions | null> {
  const params = new URLSearchParams();
  if (startBlock) params.set('startBlock', String(startBlock));
  if (etherscanApiKey) params.set('apiKey', etherscanApiKey);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<ApiTransactions>(`${BASE}/txns/${chain}/${address}${qs}`);
}

// ---------------------------------------------------------------------------
// HEX Stakes
// ---------------------------------------------------------------------------

export interface ApiStake {
  id: string;
  stakeId: number;
  stakedHearts: string;
  stakeShares: string;
  lockedDay: number;
  stakedDays: number;
  unlockedDay: number;
  isAutoStake: boolean;
  progress: number;
  daysRemaining: number;
  tShares: number;
  stakedHex: number;
  stakeHexYield?: number;
  chain: string;
  walletAddress: string;
}

export interface ApiStakes {
  chain: string;
  address: string;
  stakes: ApiStake[];
}

export function fetchStakes(address: string, chain: 'pulsechain' | 'ethereum'): Promise<ApiStakes | null> {
  return apiFetch<ApiStakes>(`${BASE}/stakes/${address}?chain=${chain}`);
}

// ---------------------------------------------------------------------------
// LP Positions
// ---------------------------------------------------------------------------

export interface ApiLpPosition {
  pairAddress: string;
  pairName: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Amount: number;
  token1Amount: number;
  totalUsd: number;
  lpBalance: number;
  ownershipPct: number;
  isStaked: boolean;
}

export interface ApiLpPositions {
  address: string;
  positions: ApiLpPosition[];
}

export function fetchLpPositions(address: string): Promise<ApiLpPositions | null> {
  return apiFetch<ApiLpPositions>(`${BASE}/lp/${address}`);
}

// ---------------------------------------------------------------------------
// Wallet registry
// ---------------------------------------------------------------------------

export interface ApiWallet {
  address: string;
  label: string | null;
  created_at: number;
}

export function registerWallet(address: string, label?: string): Promise<ApiWallet | null> {
  return apiFetch<ApiWallet>(`${BASE}/wallets`, {
    method: 'POST',
    body: JSON.stringify({ address, label }),
  });
}

export function removeWallet(address: string): Promise<{ address: string } | null> {
  return apiFetch<{ address: string }>(`${BASE}/wallets/${address}`, { method: 'DELETE' });
}

export function listWallets(): Promise<ApiWallet[] | null> {
  return apiFetch<ApiWallet[]>(`${BASE}/wallets`);
}
