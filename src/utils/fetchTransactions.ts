import type { Chain, Transaction, TransactionQueryResult } from '../types';
import { resolveBlockscoutBase } from './localStorageDebounce';
import { normalizeTransactions } from './normalizeTransactions';

const PULSECHAIN_NATIVE_DECIMALS = 18;
const EVM_NATIVE_DECIMALS = 18;
const ERC20_TYPE_FILTER = 'ERC-20';
const BLOCKSCOUT_PAGE_TIMEOUT = 30_000;
const MAX_PAGES = 200;
const PULSECHAIN_HEX_ADDRESS = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
const BASE_BLOCKSCOUT_API = 'https://base.blockscout.com/api/v2';
const ETHERSCAN_API = 'https://api.etherscan.io/v2/api?chainid=1';
const PULSECHAIN_COMPAT_API = 'https://api.scan.pulsechain.com/api';
const ETH_START_BLOCK = 11565019;
const ETH_PAGE_SIZE = 10000;
const PULSECHAIN_COMPAT_PAGE_SIZE = 100;
const LIBERTY_SWAP_SELECTOR = 'dc655e26';
const LIBERTY_SWAP_BASE_ROUTER = '0xcf3d89aedd07ee94e5c45037581744e2d9f0b9fc';
const MARKET_PRICE_IDS = ['ethereum', 'usd-coin', 'tether', 'dai', 'wrapped-bitcoin', 'hex'] as const;
const FETCH_TIMEOUT_MS = 20_000;
const PULSECHAIN_FETCH_TIMEOUT_MS = 75_000;

type FetchLike = typeof fetch;
type MarketPriceMap = Partial<Record<(typeof MARKET_PRICE_IDS)[number], number>>;

type HashRef = {
  hash?: string | null;
};

type FeeRef = {
  value?: string | null;
};

type AddressTransactionItem = {
  hash: string;
  timestamp?: string | null;
  block?: number | string | null;
  block_number?: number | string | null;
  from?: HashRef | null;
  to?: HashRef | null;
  value?: string | null;
  fee?: FeeRef | null;
  status?: string | null;
  method?: string | null;
};

type TokenRef = {
  address?: string | null;
  address_hash?: string | null;
  symbol?: string | null;
  name?: string | null;
  decimals?: string | null;
  exchange_rate?: string | null;
};

type TotalRef = {
  value?: string | null;
  decimals?: string | null;
};

type AddressTokenTransferItem = {
  tx_hash?: string | null;
  transaction_hash: string;
  method?: string | null;
  timestamp?: string | null;
  block_number?: number | string | null;
  from?: HashRef | null;
  to?: HashRef | null;
  token?: TokenRef | null;
  total?: TotalRef | null;
  log_index?: number | string | null;
};

type EtherscanResponse<T> = {
  status?: string;
  message?: string;
  result?: T[] | string;
};

type EtherscanNativeTransactionItem = {
  hash: string;
  timeStamp: string;
  blockNumber?: string;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  gasPrice?: string;
  functionName?: string;
  input?: string;
  txreceipt_status?: string;
  isError?: string;
};

type EtherscanTokenTransactionItem = {
  hash: string;
  timeStamp: string;
  blockNumber?: string;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  gasPrice?: string;
  logIndex?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  contractAddress: string;
};

type EtherscanInternalTransactionItem = {
  hash?: string;
  transactionHash?: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  blockNumber?: string;
};

type PagedResponse<T> = {
  items?: T[];
  next_page_params?: {
    block_number?: number | null;
    index?: number | null;
  } | null;
};

type BlockscoutNativeTransactionItem = AddressTransactionItem & {
  raw_input?: string | null;
  input?: string | null;
  gas_used?: string | null;
  gas_price?: string | null;
};

type BridgeTokenMetadata = {
  asset: string;
  bridged: true;
  bridge?: {
    originChain: Chain;
    protocol: 'official' | 'liberty';
  };
};

const BASE_TOKEN_PRICE_MAP: Record<string, { asset: string; coinGeckoId: keyof MarketPriceMap }> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { asset: 'USDC', coinGeckoId: 'usd-coin' },
  '0x4200000000000000000000000000000000000006': { asset: 'WETH', coinGeckoId: 'ethereum' },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { asset: 'DAI', coinGeckoId: 'dai' },
};

const ETHEREUM_TOKEN_PRICE_MAP: Record<string, { asset?: string; coinGeckoId: keyof MarketPriceMap }> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { asset: 'USDC', coinGeckoId: 'usd-coin' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { asset: 'USDT', coinGeckoId: 'tether' },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { asset: 'DAI', coinGeckoId: 'dai' },
  '0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2': { asset: 'WETH', coinGeckoId: 'ethereum' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { asset: 'WBTC', coinGeckoId: 'wrapped-bitcoin' },
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': { asset: 'HEX', coinGeckoId: 'hex' },
};

let marketPriceCache:
  | { expiresAt: number; promise: Promise<MarketPriceMap> }
  | null = null;

const BRIDGED_TOKENS: Record<string, BridgeTokenMetadata> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { asset: 'USDC (fork copy)', bridged: true },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { asset: 'DAI (fork copy)', bridged: true },
  '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c': { asset: 'WETH (from Ethereum)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'official' } },
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': { asset: 'DAI (from Ethereum)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'official' } },
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': { asset: 'USDC (from Ethereum)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'official' } },
  '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f': { asset: 'USDT (from Ethereum)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'official' } },
  '0xb17d901469b9208b17d916112988a3fed19b5ca1': { asset: 'WBTC (from Ethereum)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'official' } },
  '0x57fde0a71132198bbec939b98976993d8d89d225': { asset: 'HEX (from Ethereum)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'official' } },
  '0x80316335349e52643527c6986816e6c483478248': { asset: 'USDC (Liberty Bridge)', bridged: true, bridge: { originChain: 'ethereum', protocol: 'liberty' } },
  '0x41527c4d9d47ef03f00f77d794c87ba94832700b': { asset: 'USDC (from Base)', bridged: true, bridge: { originChain: 'base', protocol: 'official' } },
};

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function parseBlockNumber(value: number | string | null | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseTimestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDecimal(value: string | null | undefined, decimals: number): number {
  if (!value) {
    return 0;
  }

  const bigintValue = BigInt(value);
  const divisor = 10 ** decimals;

  return Number(bigintValue) / divisor;
}

function parseOptionalPositiveNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function decodeLibertySwapInput(input: string): { dstChainId: number; orderId: string } | null {
  try {
    const hex = input.startsWith('0x') ? input.slice(2) : input;
    if (!hex.startsWith(LIBERTY_SWAP_SELECTOR)) return null;
    if (hex.length < 8 + 13 * 64) return null;
    const word = (n: number) => hex.slice(8 + n * 64, 8 + (n + 1) * 64);
    const dstChainId = Number.parseInt(word(12), 16);
    const orderId = `0x${word(11)}`;
    if (!dstChainId || Number.isNaN(dstChainId)) return null;
    return { dstChainId, orderId };
  } catch {
    return null;
  }
}

async function loadMarketPrices(fetchImpl: FetchLike): Promise<MarketPriceMap> {
  const now = Date.now();
  if (marketPriceCache && marketPriceCache.expiresAt > now) {
    return marketPriceCache.promise;
  }

  const promise = (async () => {
    const query = MARKET_PRICE_IDS.join(',');
    const response = await fetchImpl(
      `https://api.coingecko.com/api/v3/simple/price?ids=${query}&vs_currencies=usd`,
    );
    if (!response.ok) {
      throw new Error(`Market price request failed: ${response.status}`);
    }

    const json = await response.json() as Record<string, { usd?: number }>;
    return MARKET_PRICE_IDS.reduce<MarketPriceMap>((acc, id) => {
      const usd = json[id]?.usd;
      if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
        acc[id] = usd;
      }
      return acc;
    }, {});
  })();

  marketPriceCache = {
    expiresAt: now + 5 * 60_000,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    marketPriceCache = null;
    throw error;
  }
}

function resolveTokenAsset(token: TokenRef | null | undefined): { asset: string; bridged?: boolean; bridge?: Transaction['bridge'] } {
  const tokenAddress = (token?.address_hash ?? token?.address)?.toLowerCase();
  if (tokenAddress && BRIDGED_TOKENS[tokenAddress]) {
    return BRIDGED_TOKENS[tokenAddress];
  }

  const symbol = token?.symbol?.trim();
  const name = token?.name?.trim();

  return {
    asset: symbol || name || 'UNKNOWN',
  };
}

async function fetchPagedJson<T>(url: string, fetchImpl: FetchLike): Promise<PagedResponse<T>> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(BLOCKSCOUT_PAGE_TIMEOUT) });

  if (!response.ok) {
    throw new Error(`Blockscout transaction request failed for ${url}: ${response.status}`);
  }

  return response.json() as Promise<PagedResponse<T>>;
}

function buildPagedUrl(baseUrl: string, nextPageParams: Record<string, string | number> | null): string {
  if (!nextPageParams || Object.keys(nextPageParams).length === 0) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${new URLSearchParams(
    Object.entries(nextPageParams).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    }, {}),
  ).toString()}`;
}

async function fetchPaginatedItems<T>(
  url: string,
  fetchImpl: FetchLike,
  startBlock?: number,
  toleratePartialFailure = false,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ items: T[]; nextBlock?: number }> {
  const items: T[] = [];
  let nextPageParams: Record<string, string | number> | null = null;
  let nextBlock: number | undefined;
  let pageCount = 0;

  do {
    if (++pageCount > MAX_PAGES) {
      console.warn(`fetchPaginatedItems: reached MAX_PAGES (${MAX_PAGES}) for ${url} – stopping early`);
      break;
    }

    const pageUrl = buildPagedUrl(url, nextPageParams);
    let page: PagedResponse<T>;
    try {
      page = await fetchPagedJson<T>(pageUrl, fetchImpl, timeoutMs);
    } catch (error) {
      if (toleratePartialFailure && items.length > 0) {
        break;
      }
      throw error;
    }
    items.push(...(page.items ?? []));

    const candidateNextBlock = parseBlockNumber(page.next_page_params?.block_number);
    if (candidateNextBlock !== undefined) {
      nextBlock = candidateNextBlock;
    }

    if (!page.next_page_params) {
      break;
    }

    if (startBlock != null && candidateNextBlock != null && candidateNextBlock < startBlock) {
      break;
    }

    nextPageParams = Object.entries(page.next_page_params).reduce<Record<string, string | number>>((acc, [key, value]) => {
      if (value != null) {
        acc[key] = value;
      }
      return acc;
    }, {});
  } while (nextPageParams && Object.keys(nextPageParams).length > 0);

  return { items, nextBlock };
}

function normalizeNativeTransactions(
  items: AddressTransactionItem[],
  walletAddress: string,
): Transaction[] {
  return items.map((item) => {
    const from = normalizeAddress(item.from?.hash ?? '');
    const to = normalizeAddress(item.to?.hash ?? '');
    const isDeposit = to === walletAddress;
    const blockNumber = parseBlockNumber(item.block_number ?? item.block);

    return {
      id: `${item.hash}-native-${isDeposit ? 'deposit' : 'withdraw'}`,
      hash: item.hash,
      timestamp: parseTimestamp(item.timestamp),
      type: isDeposit ? 'deposit' : 'withdraw',
      from,
      to,
      asset: 'PLS',
      amount: parseDecimal(item.value, PULSECHAIN_NATIVE_DECIMALS),
      fee: parseDecimal(item.fee?.value, PULSECHAIN_NATIVE_DECIMALS),
      chain: 'pulsechain',
      status: item.status ?? undefined,
      valueUsd: undefined,
      assetPriceUsdAtTx: undefined,
      counterAsset: undefined,
      counterAmount: undefined,
      counterPriceUsdAtTx: undefined,
      swapLegOnly: undefined,
      bridged: undefined,
      libertySwap: undefined,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    } as Transaction & { blockNumber?: number };
  });
}

function normalizeMethod(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveHexStakingAction(
  method: string | null | undefined,
  tokenAddress: string | null | undefined,
  to: string,
): Transaction['staking'] | undefined {
  const normalizedMethod = normalizeMethod(method);
  const normalizedTokenAddress = tokenAddress?.toLowerCase();
  const isHexTransfer = normalizedTokenAddress === PULSECHAIN_HEX_ADDRESS;
  const isHexTarget = to === PULSECHAIN_HEX_ADDRESS;

  if (normalizedMethod === 'stakestart' && isHexTransfer && isHexTarget) {
    return {
      protocol: 'hex',
      action: 'stakeStart',
    };
  }

  if (normalizedMethod === 'stakeend' && isHexTransfer) {
    return {
      protocol: 'hex',
      action: 'stakeEnd',
    };
  }

  return undefined;
}

function normalizeTokenTransfers(
  items: AddressTokenTransferItem[],
  walletAddress: string,
  txMetaByHash: Map<string, { fee?: number; status?: string; method?: string }>,
): Transaction[] {
  return items.map((item) => {
    const hash = item.transaction_hash ?? item.tx_hash ?? '';
    const from = normalizeAddress(item.from?.hash ?? '');
    const to = normalizeAddress(item.to?.hash ?? '');
    const isDeposit = to === walletAddress;
    const decimals = Number.parseInt(item.total?.decimals ?? item.token?.decimals ?? '18', 10);
    const amount = parseDecimal(item.total?.value, Number.isFinite(decimals) ? decimals : 18);
    const resolvedToken = resolveTokenAsset(item.token);
    const exchangeRate = parseOptionalPositiveNumber(item.token?.exchange_rate);
    const meta = txMetaByHash.get(hash);
    const blockNumber = parseBlockNumber(item.block_number);
    const tokenAddress = item.token?.address_hash ?? item.token?.address;
    const staking = resolveHexStakingAction(item.method ?? meta?.method, tokenAddress, to);

    return {
      id: `${hash}-${tokenAddress?.toLowerCase() ?? 'token'}-${isDeposit ? 'deposit' : 'withdraw'}-${item.log_index ?? 0}`,
      hash,
      timestamp: parseTimestamp(item.timestamp),
      type: isDeposit ? 'deposit' : 'withdraw',
      from,
      to,
      asset: resolvedToken.asset,
      amount,
      valueUsd: exchangeRate ? amount * exchangeRate : undefined,
      fee: meta?.fee,
      chain: 'pulsechain',
      bridged: resolvedToken.bridged,
      bridge: resolvedToken.bridge,
      staking,
      status: meta?.status,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    } as Transaction & { blockNumber?: number };
  });
}

type FetchPulsechainTransactionsOptions = {
  baseUrl?: string;
  compatApiBase?: string;
  fetchImpl?: FetchLike;
  startBlock?: number;
};

function resolveCompatMethodName(
  functionName: string | undefined,
  input: string | undefined,
): string | undefined {
  const trimmed = functionName?.trim();
  if (trimmed) {
    return trimmed.split('(')[0];
  }

  const normalizedInput = input?.trim().toLowerCase();
  if (!normalizedInput || normalizedInput === '0x') {
    return undefined;
  }

  return normalizedInput;
}

function resolvePulsechainCompatTokenAsset(
  contractAddress: string,
  symbol: string | undefined,
  name: string | undefined,
): { asset: string; bridged?: boolean; bridge?: Transaction['bridge'] } {
  const tokenAddress = contractAddress.toLowerCase();
  if (BRIDGED_TOKENS[tokenAddress]) {
    return BRIDGED_TOKENS[tokenAddress];
  }

  return {
    asset: symbol?.trim() || name?.trim() || 'UNKNOWN',
  };
}

async function fetchPulsechainTransactionsViaCompatApi(
  address: string,
  options: FetchPulsechainTransactionsOptions,
): Promise<TransactionQueryResult> {
  const walletAddress = normalizeAddress(address);
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.compatApiBase ?? PULSECHAIN_COMPAT_API;
  const startBlock = options.startBlock ?? 0;

  const [nativeTransactions, tokenTransactions, internalTransactions] = await Promise.all([
    fetchAllEtherscanPages<EtherscanNativeTransactionItem>(
      'txlist',
      walletAddress,
      fetchImpl,
      undefined,
      startBlock,
      apiBase,
      PULSECHAIN_COMPAT_PAGE_SIZE,
      'desc',
    ),
    fetchAllEtherscanPages<EtherscanTokenTransactionItem>(
      'tokentx',
      walletAddress,
      fetchImpl,
      undefined,
      startBlock,
      apiBase,
      PULSECHAIN_COMPAT_PAGE_SIZE,
      'desc',
    ),
    fetchAllEtherscanPages<EtherscanInternalTransactionItem>(
      'txlistinternal',
      walletAddress,
      fetchImpl,
      undefined,
      startBlock,
      apiBase,
      PULSECHAIN_COMPAT_PAGE_SIZE,
      'desc',
    ),
  ]);

  const txMetaByHash = new Map<string, { fee?: number; status?: string; method?: string }>();
  for (const item of nativeTransactions) {
    txMetaByHash.set(item.hash, {
      fee: item.gasUsed && item.gasPrice
        ? parseDecimal((BigInt(item.gasUsed) * BigInt(item.gasPrice)).toString(), PULSECHAIN_NATIVE_DECIMALS)
        : 0,
      status: item.txreceipt_status === '1' || item.isError === '0' ? 'ok' : undefined,
      method: resolveCompatMethodName(item.functionName, item.input),
    });
  }

  const rawTransactions: Array<Transaction & { blockNumber?: number }> = [
    ...nativeTransactions.map((item) => {
      const from = normalizeAddress(item.from);
      const to = normalizeAddress(item.to);
      const isDeposit = to === walletAddress;
      const type: Transaction['type'] = isDeposit ? 'deposit' : 'withdraw';
      const blockNumber = parseBlockNumber(item.blockNumber);

      return {
        id: `${item.hash}-native-${isDeposit ? 'deposit' : 'withdraw'}`,
        hash: item.hash,
        timestamp: Number(item.timeStamp) * 1000,
        type,
        from,
        to,
        asset: 'PLS',
        amount: parseDecimal(item.value, PULSECHAIN_NATIVE_DECIMALS),
        fee: item.gasUsed && item.gasPrice
          ? parseDecimal((BigInt(item.gasUsed) * BigInt(item.gasPrice)).toString(), PULSECHAIN_NATIVE_DECIMALS)
          : 0,
        chain: 'pulsechain' as const,
        status: item.txreceipt_status === '1' || item.isError === '0' ? 'ok' : undefined,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } satisfies Transaction & { blockNumber?: number };
    }),
    ...tokenTransactions.map((item) => {
      const from = normalizeAddress(item.from);
      const to = normalizeAddress(item.to);
      const isDeposit = to === walletAddress;
      const type: Transaction['type'] = isDeposit ? 'deposit' : 'withdraw';
      const blockNumber = parseBlockNumber(item.blockNumber);
      const tokenAddress = item.contractAddress.toLowerCase();
      const decimals = Number.parseInt(item.tokenDecimal ?? '18', 10);
      const amount = parseDecimal(item.value, Number.isFinite(decimals) ? decimals : 18);
      const resolvedToken = resolvePulsechainCompatTokenAsset(tokenAddress, item.tokenSymbol, item.tokenName);
      const meta = txMetaByHash.get(item.hash);
      const staking = resolveHexStakingAction(meta?.method, tokenAddress, to);

      return {
        id: `${item.hash}-${tokenAddress}-${isDeposit ? 'deposit' : 'withdraw'}-${item.logIndex ?? 0}`,
        hash: item.hash,
        timestamp: Number(item.timeStamp) * 1000,
        type,
        from,
        to,
        asset: resolvedToken.asset,
        amount,
        fee: meta?.fee,
        chain: 'pulsechain' as const,
        bridged: resolvedToken.bridged,
        bridge: resolvedToken.bridge,
        staking,
        status: meta?.status,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } satisfies Transaction & { blockNumber?: number };
    }),
    ...internalTransactions.map((item) => {
      const hash = item.hash ?? item.transactionHash ?? '';
      const from = normalizeAddress(item.from);
      const to = normalizeAddress(item.to);
      const isDeposit = to === walletAddress;
      const type: Transaction['type'] = isDeposit ? 'deposit' : 'withdraw';
      const blockNumber = parseBlockNumber(item.blockNumber);

      return {
        id: `${hash}-internal-${isDeposit ? 'deposit' : 'withdraw'}`,
        hash,
        timestamp: Number(item.timeStamp) * 1000,
        type,
        from,
        to,
        asset: 'PLS',
        amount: parseDecimal(item.value, PULSECHAIN_NATIVE_DECIMALS),
        fee: txMetaByHash.get(hash)?.fee,
        chain: 'pulsechain' as const,
        status: txMetaByHash.get(hash)?.status,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } satisfies Transaction & { blockNumber?: number };
    }),
  ];

  const normalizedTransactions = normalizeTransactions(rawTransactions, new Set([walletAddress]));

  return {
    implemented: true,
    transactions: normalizedTransactions,
    nextBlock: undefined,
  };
}

async function fetchPulsechainTransactionsViaBlockscoutV2(
  address: string,
  options: FetchPulsechainTransactionsOptions = {},
): Promise<TransactionQueryResult> {
  const walletAddress = normalizeAddress(address);
  const baseUrl = options.baseUrl ?? resolveBlockscoutBase();
  const fetchImpl = options.fetchImpl ?? fetch;

  const [transactionsResult, tokenTransfersResult] = await Promise.allSettled([
    fetchPaginatedItems<AddressTransactionItem>(
      `${baseUrl}/addresses/${walletAddress}/transactions`,
      fetchImpl,
      options.startBlock,
      false,
      PULSECHAIN_FETCH_TIMEOUT_MS,
    ),
    fetchPaginatedItems<AddressTokenTransferItem>(
      `${baseUrl}/addresses/${walletAddress}/token-transfers?type=${ERC20_TYPE_FILTER}`,
      fetchImpl,
      options.startBlock,
      true,
      PULSECHAIN_FETCH_TIMEOUT_MS,
    ),
  ]);

  if (transactionsResult.status === 'rejected' && tokenTransfersResult.status === 'rejected') {
    throw transactionsResult.reason;
  }

  const transactionsResponse = transactionsResult.status === 'fulfilled'
    ? transactionsResult.value
    : { items: [], nextBlock: undefined };
  const tokenTransfersResponse = tokenTransfersResult.status === 'fulfilled'
    ? tokenTransfersResult.value
    : { items: [], nextBlock: undefined };

  const txMetaByHash = new Map<string, { fee?: number; status?: string; method?: string }>();
  for (const item of transactionsResponse.items) {
    txMetaByHash.set(item.hash, {
      fee: parseDecimal(item.fee?.value, PULSECHAIN_NATIVE_DECIMALS),
      status: item.status ?? undefined,
      method: (item as AddressTransactionItem & { method?: string | null }).method ?? undefined,
    });
  }

  const rawTransactions = [
    ...normalizeNativeTransactions(transactionsResponse.items, walletAddress),
    ...normalizeTokenTransfers(tokenTransfersResponse.items, walletAddress, txMetaByHash),
  ];

  const filteredRawTransactions = rawTransactions.filter((tx) => {
    const blockNumber = (tx as Transaction & { blockNumber?: number }).blockNumber;
    return options.startBlock == null || blockNumber == null || blockNumber >= options.startBlock;
  });

  const normalizedTransactions = normalizeTransactions(filteredRawTransactions, new Set([walletAddress]));

  const nextBlocks = [
    transactionsResponse.nextBlock,
    tokenTransfersResponse.nextBlock,
  ]
    .map(value => parseBlockNumber(value))
    .filter((value): value is number => value !== undefined);

  return {
    implemented: true,
    transactions: normalizedTransactions,
    nextBlock: nextBlocks.length > 0 ? Math.max(...nextBlocks) : undefined,
  };
}

export async function fetchPulsechainTransactions(
  address: string,
  options: FetchPulsechainTransactionsOptions = {},
): Promise<TransactionQueryResult> {
  if (options.baseUrl) {
    return fetchPulsechainTransactionsViaBlockscoutV2(address, options);
  }

  try {
    const compatResult = await fetchPulsechainTransactionsViaCompatApi(address, options);
    if (compatResult.transactions.length > 0) {
      return compatResult;
    }
  } catch {
    // fall through to the slower Blockscout v2 path
  }

  return fetchPulsechainTransactionsViaBlockscoutV2(address, options);
}

type FetchBaseTransactionsOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  startBlock?: number;
  marketPrices?: MarketPriceMap;
};

export async function fetchBaseTransactions(
  address: string,
  options: FetchBaseTransactionsOptions = {},
): Promise<TransactionQueryResult> {
  const walletAddress = normalizeAddress(address);
  const baseUrl = options.baseUrl ?? BASE_BLOCKSCOUT_API;
  const fetchImpl = options.fetchImpl ?? fetch;
  const marketPrices = options.marketPrices ?? await loadMarketPrices(fetchImpl).catch<MarketPriceMap>(() => ({}));

  const [transactionsResponse, tokenTransfersResponse] = await Promise.all([
    fetchPaginatedItems<BlockscoutNativeTransactionItem>(
      `${baseUrl}/addresses/${walletAddress}/transactions`,
      fetchImpl,
      options.startBlock,
    ),
    fetchPaginatedItems<AddressTokenTransferItem>(
      `${baseUrl}/addresses/${walletAddress}/token-transfers?type=${ERC20_TYPE_FILTER}`,
      fetchImpl,
      options.startBlock,
    ),
  ]);

  const libertySwapByHash = new Map<string, { dstChainId: number; orderId: string }>();
  const nativePriceUsd = marketPrices.ethereum ?? 0;

  const nativeTransactions = transactionsResponse.items.map((item) => {
    const from = normalizeAddress(item.from?.hash ?? '');
    const to = normalizeAddress(item.to?.hash ?? '');
    const isDeposit = to === walletAddress;
    const blockNumber = parseBlockNumber(item.block_number ?? item.block);
    const toAddr = normalizeAddress(item.to?.hash ?? '');

    if (!isDeposit && toAddr === LIBERTY_SWAP_BASE_ROUTER) {
      const libertySwap = decodeLibertySwapInput(item.raw_input ?? item.input ?? '');
      if (libertySwap) {
        libertySwapByHash.set(item.hash.toLowerCase(), libertySwap);
      }
    }

    const amount = parseDecimal(item.value, EVM_NATIVE_DECIMALS);
    return {
      id: `${item.hash}-native-${isDeposit ? 'deposit' : 'withdraw'}`,
      hash: item.hash,
      timestamp: parseTimestamp(item.timestamp),
      type: isDeposit ? 'deposit' : 'withdraw',
      from,
      to,
      asset: 'ETH',
      amount,
      valueUsd: amount > 0 && nativePriceUsd > 0 ? amount * nativePriceUsd : undefined,
      fee: item.gas_used && item.gas_price
        ? parseDecimal((BigInt(item.gas_used) * BigInt(item.gas_price)).toString(), EVM_NATIVE_DECIMALS)
        : 0,
      chain: 'base',
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    } as Transaction & { blockNumber?: number };
  });

  const tokenTransactions = tokenTransfersResponse.items.map((item) => {
    const from = normalizeAddress(item.from?.hash ?? '');
    const to = normalizeAddress(item.to?.hash ?? '');
    const isDeposit = to === walletAddress;
    const tokenAddress = item.token?.address_hash?.toLowerCase() ?? '';
    const blockNumber = parseBlockNumber(item.block_number);
    const decimals = Number.parseInt(item.total?.decimals ?? item.token?.decimals ?? '18', 10);
    const amount = parseDecimal(item.total?.value, Number.isFinite(decimals) ? decimals : 18);
    const mapping = BASE_TOKEN_PRICE_MAP[tokenAddress];
    const asset = mapping?.asset ?? item.token?.symbol?.trim() ?? item.token?.name?.trim() ?? 'TOKEN';
    const priceUsd = mapping?.coinGeckoId ? marketPrices[mapping.coinGeckoId] : undefined;

    return {
      id: `${item.transaction_hash}-${tokenAddress || 'token'}-${isDeposit ? 'deposit' : 'withdraw'}-${item.log_index ?? 0}`,
      hash: item.transaction_hash,
      timestamp: parseTimestamp(item.timestamp),
      type: isDeposit ? 'deposit' : 'withdraw',
      from,
      to,
      asset,
      amount,
      valueUsd: priceUsd ? amount * priceUsd : undefined,
      fee: 0,
      chain: 'base',
      libertySwap: libertySwapByHash.get(item.transaction_hash.toLowerCase()),
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    } as Transaction & { blockNumber?: number };
  });

  const rawTransactions = [...nativeTransactions, ...tokenTransactions];
  const filteredRawTransactions = rawTransactions.filter((tx) => {
    const blockNumber = (tx as Transaction & { blockNumber?: number }).blockNumber;
    return options.startBlock == null || blockNumber == null || blockNumber >= options.startBlock;
  });
  const normalizedTransactions = normalizeTransactions(filteredRawTransactions, new Set([walletAddress]));

  const nextBlocks = [transactionsResponse.nextBlock, tokenTransfersResponse.nextBlock]
    .map(value => parseBlockNumber(value))
    .filter((value): value is number => value !== undefined);

  return {
    implemented: true,
    transactions: normalizedTransactions,
    nextBlock: nextBlocks.length > 0 ? Math.max(...nextBlocks) : undefined,
  };
}

type FetchEthereumTransactionsOptions = {
  apiBase?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  startBlock?: number;
  marketPrices?: MarketPriceMap;
};

async function fetchAllEtherscanPages<T>(
  action: string,
  address: string,
  fetchImpl: FetchLike,
  apiKey: string | undefined,
  startBlock: number,
  apiBase: string,
  pageSize = ETH_PAGE_SIZE,
  sort: 'asc' | 'desc' = 'asc',
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let retries = 0;

  while (true) {
    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : '';
    const separator = apiBase.includes('?') ? '&' : '?';
    const url = `${apiBase}${separator}module=account&action=${action}&address=${address}`
      + `&startblock=${startBlock}&endblock=99999999&sort=${sort}&page=${page}&offset=${pageSize}${apiKeyParam}`;
    const response = await fetchImpl(url);
    const data = await response.json() as EtherscanResponse<T>;

    if (data.status === '1' && Array.isArray(data.result)) {
      results.push(...data.result);
      if (data.result.length < pageSize) break;
      page += 1;
      retries = 0;
      continue;
    }

    const message = (typeof data.result === 'string' ? data.result : data.message ?? '').toLowerCase();
    if ((message.includes('rate limit') || message.includes('max rate')) && retries < 3) {
      retries += 1;
      await new Promise(resolve => setTimeout(resolve, 1500 * retries));
      continue;
    }

    break;
  }

  return results;
}

export async function fetchEthereumTransactions(
  address: string,
  options: FetchEthereumTransactionsOptions = {},
): Promise<TransactionQueryResult> {
  const walletAddress = normalizeAddress(address);
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBase ?? ETHERSCAN_API;
  const apiKey = options.apiKey;
  const startBlock = options.startBlock ?? ETH_START_BLOCK;
  const marketPrices = options.marketPrices ?? await loadMarketPrices(fetchImpl).catch<MarketPriceMap>(() => ({}));
  const nativePriceUsd = marketPrices.ethereum ?? 0;

  const [nativeTransactions, tokenTransactions, internalTransactions] = await Promise.all([
    fetchAllEtherscanPages<EtherscanNativeTransactionItem>('txlist', walletAddress, fetchImpl, apiKey, startBlock, apiBase),
    fetchAllEtherscanPages<EtherscanTokenTransactionItem>('tokentx', walletAddress, fetchImpl, apiKey, startBlock, apiBase),
    fetchAllEtherscanPages<EtherscanInternalTransactionItem>('txlistinternal', walletAddress, fetchImpl, apiKey, startBlock, apiBase),
  ]);

  const rawTransactions: Transaction[] = [
    ...nativeTransactions.map((item) => {
      const from = normalizeAddress(item.from);
      const to = normalizeAddress(item.to);
      const isDeposit = to === walletAddress;
      const amount = parseDecimal(item.value, EVM_NATIVE_DECIMALS);

      return {
        id: `${item.hash}-native-${isDeposit ? 'deposit' : 'withdraw'}`,
        hash: item.hash,
        timestamp: Number(item.timeStamp) * 1000,
        type: isDeposit ? 'deposit' : 'withdraw',
        from,
        to,
        asset: 'ETH',
        amount,
        valueUsd: amount > 0 && nativePriceUsd > 0 ? amount * nativePriceUsd : undefined,
        fee: item.gasUsed && item.gasPrice
          ? parseDecimal((BigInt(item.gasUsed) * BigInt(item.gasPrice)).toString(), EVM_NATIVE_DECIMALS)
          : 0,
        chain: 'ethereum',
      } satisfies Transaction;
    }),
    ...tokenTransactions.map((item) => {
      const from = normalizeAddress(item.from);
      const to = normalizeAddress(item.to);
      const isDeposit = to === walletAddress;
      const tokenAddress = item.contractAddress.toLowerCase();
      const amount = parseDecimal(item.value, Number.parseInt(item.tokenDecimal ?? '18', 10));
      const mapping = ETHEREUM_TOKEN_PRICE_MAP[tokenAddress];
      const asset = mapping?.asset ?? item.tokenSymbol?.trim() ?? 'TOKEN';
      const priceUsd = mapping?.coinGeckoId ? marketPrices[mapping.coinGeckoId] : undefined;

      return {
        id: `${item.hash}-${tokenAddress || 'token'}-${isDeposit ? 'deposit' : 'withdraw'}-${item.logIndex ?? 0}`,
        hash: item.hash,
        timestamp: Number(item.timeStamp) * 1000,
        type: isDeposit ? 'deposit' : 'withdraw',
        from,
        to,
        asset,
        amount,
        valueUsd: priceUsd ? amount * priceUsd : undefined,
        fee: item.gasUsed && item.gasPrice
          ? parseDecimal((BigInt(item.gasUsed) * BigInt(item.gasPrice)).toString(), EVM_NATIVE_DECIMALS)
          : 0,
        chain: 'ethereum',
      } satisfies Transaction;
    }),
    ...internalTransactions.flatMap((item, index) => {
      const from = normalizeAddress(item.from);
      const to = normalizeAddress(item.to);
      const isDeposit = to === walletAddress;
      const isWithdrawal = from === walletAddress;
      const amount = parseDecimal(item.value, EVM_NATIVE_DECIMALS);

      if ((!isDeposit && !isWithdrawal) || amount <= 0) {
        return [];
      }

      return [{
        id: `${item.hash}-internal-${index}`,
        hash: item.hash,
        timestamp: Number(item.timeStamp) * 1000,
        type: isDeposit ? 'deposit' : 'withdraw',
        from,
        to,
        asset: 'ETH',
        amount,
        valueUsd: amount > 0 && nativePriceUsd > 0 ? amount * nativePriceUsd : undefined,
        fee: 0,
        chain: 'ethereum',
      } satisfies Transaction];
    }),
  ];

  return {
    implemented: true,
    transactions: normalizeTransactions(rawTransactions, new Set([walletAddress])),
  };
}
