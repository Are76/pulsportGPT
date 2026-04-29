/**
 * PulseChain Scanner API client.
 * TypeScript equivalent of the python-pulsechain PyPI package.
 * Wraps the PulseChain Blockscout-compatible REST API at scan.pulsechain.com/api/v2.
 *
 * Subclients:
 *   pulsechainScanner.stats            — chain statistics
 *   pulsechainScanner.addresses        — address info and token balances
 *   pulsechainScanner.transactions     — transaction lookup
 *   pulsechainScanner.tokens           — token info and search
 *   pulsechainScanner.blocks           — block info
 *   pulsechainScanner.search           — full-text search
 *   pulsechainScanner.smartContracts   — smart contract info
 */

const SCANNER_BASE_URL = 'https://scan.pulsechain.com/api/v2';
const SCANNER_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PagedResult<T> {
  items: T[];
  next_page_params: Record<string, string | number> | null;
}

export interface ChainStats {
  total_blocks: string;
  total_addresses: string;
  total_transactions: string;
  average_block_time: number;
  coin_price: string | null;
  coin_price_change_percentage: string | null;
  gas_prices: {
    average: number;
    fast: number;
    slow: number;
  } | null;
  market_cap: string | null;
  network_utilization_percentage: number | null;
  transactions_today: string | null;
  [key: string]: unknown;
}

export interface AddressInfo {
  hash: string;
  is_contract: boolean;
  is_verified: boolean | null;
  name: string | null;
  creation_tx_hash: string | null;
  token: TokenInfo | null;
  coin_balance: string | null;
  exchange_rate: string | null;
  block_number_balance_updated_at: number | null;
  [key: string]: unknown;
}

export interface TokenBalanceItem {
  token: TokenInfo;
  value: string;
  token_id: string | null;
  token_instance: unknown | null;
}

export interface TokenInfo {
  address: string;
  decimals: string | null;
  exchange_rate: string | null;
  holders: string | null;
  icon_url: string | null;
  name: string | null;
  symbol: string | null;
  total_supply: string | null;
  type: string;
  volume_24h: string | null;
  circulating_market_cap: string | null;
  [key: string]: unknown;
}

export interface AddressTxItem {
  hash: string;
  timestamp: string;
  from: { hash: string } | null;
  to: { hash: string } | null;
  value: string;
  fee: { value: string } | null;
  status: string | null;
  method: string | null;
  block: number | null;
  [key: string]: unknown;
}

export interface TxInfo {
  hash: string;
  timestamp: string | null;
  from: { hash: string } | null;
  to: { hash: string } | null;
  value: string;
  fee: { value: string } | null;
  status: string | null;
  method: string | null;
  block: number | null;
  [key: string]: unknown;
}

export interface BlockInfo {
  height: number;
  hash: string;
  timestamp: string;
  transaction_count: number;
  miner: { hash: string } | null;
  base_fee_per_gas: string | null;
  gas_used: string;
  gas_limit: string;
  size: number;
  [key: string]: unknown;
}

export interface SearchResultItem {
  type: 'address' | 'transaction' | 'token' | 'block' | 'contract';
  address: string | null;
  name: string | null;
  symbol: string | null;
  tx_hash: string | null;
  block_number: number | null;
  url: string | null;
  [key: string]: unknown;
}

export interface SearchResult {
  items: SearchResultItem[];
  next_page_params: Record<string, string | number> | null;
}

export interface SmartContractInfo {
  address: string;
  name: string | null;
  compiler_version: string | null;
  is_verified: boolean | null;
  abi: unknown[] | null;
  source_code: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Custom errors (mirroring python-pulsechain exceptions)
// ---------------------------------------------------------------------------

export class PulseChainAPIException extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'PulseChainAPIException';
  }
}

export class PulseChainTimeoutException extends Error {
  constructor(url: string) {
    super(`Request timed out: ${url}`);
    this.name = 'PulseChainTimeoutException';
  }
}

export class PulseChainServerError extends Error {
  constructor(status: number, url: string) {
    super(`Server error ${status} from ${url}`);
    this.name = 'PulseChainServerError';
  }
}

export class PulseChainBadRequestException extends Error {
  constructor(url: string) {
    super(`Bad request: ${url}`);
    this.name = 'PulseChainBadRequestException';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Converts a mixed-value page-params map to the string-only form required by `scannerFetch`. */
function toStringParams(params: Record<string, string | number>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    result[k] = String(v);
  }
  return result;
}

async function scannerFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SCANNER_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const urlString = url.toString();
  let response: Response;

  try {
    response = await fetch(urlString, { signal: AbortSignal.timeout(SCANNER_TIMEOUT) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new PulseChainTimeoutException(urlString);
    }
    throw new PulseChainAPIException(String(err));
  }

  if (response.status === 400) {
    throw new PulseChainBadRequestException(urlString);
  }
  if (response.status >= 500) {
    throw new PulseChainServerError(response.status, urlString);
  }
  if (!response.ok) {
    throw new PulseChainAPIException(`HTTP ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Subclients
// ---------------------------------------------------------------------------

class StatsClient {
  /** Fetch overall PulseChain network statistics. */
  async getStats(): Promise<ChainStats> {
    return scannerFetch<ChainStats>('/stats');
  }
}

class AddressesClient {
  /** Fetch metadata for a single address (balance, contract flag, etc.). */
  async getInfo(address: string): Promise<AddressInfo> {
    return scannerFetch<AddressInfo>(`/addresses/${address}`);
  }

  /**
   * Fetch all ERC-20 / ERC-721 token balances held by an address.
   * Mirrors python-pulsechain `client.addresses.get_token_balances`.
   */
  async getTokenBalances(address: string): Promise<TokenBalanceItem[]> {
    const result = await scannerFetch<PagedResult<TokenBalanceItem>>(
      `/addresses/${address}/token-balances`,
    );
    return result.items ?? [];
  }

  /**
   * Fetch transactions for an address (first page).
   * For paginated access use `getTransactionsPaged`.
   */
  async getTransactions(address: string): Promise<PagedResult<AddressTxItem>> {
    return scannerFetch<PagedResult<AddressTxItem>>(
      `/addresses/${address}/transactions`,
    );
  }

  /** Fetch the next page of transactions using `next_page_params`. */
  async getTransactionsPaged(
    address: string,
    nextPageParams: Record<string, string | number>,
  ): Promise<PagedResult<AddressTxItem>> {
    return scannerFetch<PagedResult<AddressTxItem>>(
      `/addresses/${address}/transactions`,
      toStringParams(nextPageParams),
    );
  }
}

class TransactionsClient {
  /** Look up a single transaction by hash. */
  async getTransaction(hash: string): Promise<TxInfo> {
    return scannerFetch<TxInfo>(`/transactions/${hash}`);
  }
}

class TokensClient {
  /**
   * Look up information about a single token contract.
   * Mirrors python-pulsechain `client.tokens.get_token`.
   */
  async getToken(address: string): Promise<TokenInfo> {
    return scannerFetch<TokenInfo>(`/tokens/${address}`);
  }

  /**
   * Search or list tokens.
   * Pass `q` to filter by name/symbol.
   * Mirrors python-pulsechain `client.tokens.get_tokens`.
   */
  async getTokens(params?: { q?: string }): Promise<PagedResult<TokenInfo>> {
    const queryParams: Record<string, string> = {};
    if (params?.q) queryParams.q = params.q;
    return scannerFetch<PagedResult<TokenInfo>>('/tokens', queryParams);
  }
}

class BlocksClient {
  /**
   * Fetch a block by its number or hash.
   * Mirrors python-pulsechain `client.blocks.get_block`.
   */
  async getBlock(numberOrHash: string | number): Promise<BlockInfo> {
    return scannerFetch<BlockInfo>(`/blocks/${numberOrHash}`);
  }

  /**
   * Fetch transactions contained in a block (first page).
   * Mirrors python-pulsechain `client.blocks.get_block_txns`.
   */
  async getBlockTransactions(
    numberOrHash: string | number,
    nextPageParams?: Record<string, string | number>,
  ): Promise<PagedResult<AddressTxItem>> {
    return scannerFetch<PagedResult<AddressTxItem>>(
      `/blocks/${numberOrHash}/transactions`,
      nextPageParams && Object.keys(nextPageParams).length > 0
        ? toStringParams(nextPageParams)
        : undefined,
    );
  }
}

class SearchClient {
  /**
   * Full-text search across addresses, tokens, transactions, and blocks.
   * Mirrors python-pulsechain `client.search.search`.
   */
  async search(query: string): Promise<SearchResult> {
    return scannerFetch<SearchResult>('/search', { q: query });
  }
}

class SmartContractsClient {
  /**
   * Fetch verified smart contract info for an address.
   * Mirrors python-pulsechain `client.smart_contracts.get_smart_contract`.
   */
  async getSmartContract(address: string): Promise<SmartContractInfo> {
    return scannerFetch<SmartContractInfo>(`/smart-contracts/${address}`);
  }
}

// ---------------------------------------------------------------------------
// Main client (mirrors python-pulsechain Client class)
// ---------------------------------------------------------------------------

export class PulseChainScannerClient {
  readonly stats = new StatsClient();
  readonly addresses = new AddressesClient();
  readonly transactions = new TransactionsClient();
  readonly tokens = new TokensClient();
  readonly blocks = new BlocksClient();
  readonly search = new SearchClient();
  readonly smartContracts = new SmartContractsClient();
}

/** Singleton instance — import and use directly. */
export const pulsechainScanner = new PulseChainScannerClient();
