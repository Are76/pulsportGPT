import { TOKENS } from '../../constants';
import { fetchDefiLlamaPrices } from '../../services/marketDataService';
import { resolveBlockscoutBase } from '../../utils/localStorageDebounce';
import {
  buildBaseDiscoveredToken,
  buildEthereumDiscoveredToken,
  buildPulsechainDiscoveredToken,
  getEthereumLlamaLookupKeys,
  getPulsechainDexScreenerLookupAddresses,
  type DiscoveredToken,
} from './discoveredTokenDiscovery';

type FetchLike = typeof fetch;

type PriceEntry = { usd?: number; image?: string };
type PriceMap = Record<string, PriceEntry | undefined>;

type LoaderResult = {
  discoveredTokens: DiscoveredToken[];
  pricePatches?: Record<string, PriceEntry>;
  logoPatches?: Record<string, string>;
};

async function fetchPagedItems(
  endpoint: string,
  fetchImpl: FetchLike,
  baseUrl: string,
  maxPages = Number.POSITIVE_INFINITY,
): Promise<any[]> {
  const results: any[] = [];
  let nextParams: Record<string, string> | null = {};
  let page = 0;

  while (nextParams !== null && page < maxPages) {
    const hasExistingQuery = endpoint.includes('?');
    const paramStr = Object.keys(nextParams).length
      ? (hasExistingQuery ? '&' : '?') + new URLSearchParams(nextParams).toString()
      : '';
    const response = await fetchImpl(`${baseUrl}${endpoint}${paramStr}`);
    if (!response.ok) {
      break;
    }

    const data = await response.json();
    if (!Array.isArray(data.items)) {
      break;
    }

    results.push(...data.items);
    nextParams = data.next_page_params || null;
    if (!data.next_page_params || data.items.length === 0) {
      break;
    }

    page += 1;
  }

  return results;
}

export async function loadPulsechainDiscoveredTokens(
  address: string,
  fetchedPrices: PriceMap,
  fetchImpl: FetchLike = fetch,
): Promise<LoaderResult> {
  const pulseBridgeMap: Record<string, { name: string; id: string }> = {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { name: 'USDC (fork copy)', id: 'usd-coin' },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { name: 'DAI (fork copy)', id: 'dai' },
    '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': { name: 'USDC (from ETH)', id: 'usd-coin' },
    '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c': { name: 'WETH (from ETH)', id: 'ethereum' },
    '0xefd766ccb38eaf1dfd701853bfce31359239f305': { name: 'DAI (from ETH)', id: 'dai' },
    '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f': { name: 'USDT (from ETH)', id: 'tether' },
    '0x57fde0a71132198bbec939b98976993d8d89d225': { name: 'HEX (from ETH)', id: 'hex' },
    '0xb17d901469b9208b17d916112988a3fed19b5ca1': { name: 'WBTC (from ETH)', id: 'wrapped-bitcoin' },
    '0x80316335349e52643527c6986816e6c483478248': { name: 'USDC (Liberty Bridge)', id: 'usd-coin' },
    '0x41527c4d9d47ef03f00f77d794c87ba94832700b': { name: 'USDC (from Base)', id: 'usd-coin' },
  };

  const baseUrl = resolveBlockscoutBase();
  const balanceItems = await fetchPagedItems(
    `/addresses/${address}/tokens?type=ERC-20`,
    fetchImpl,
    baseUrl,
    20,
  );

  const discoveredTokens: DiscoveredToken[] = [];
  const pricePatches: Record<string, PriceEntry> = {};

  balanceItems.forEach((item: any) => {
    const tokenInfo = item?.token || item;
    const rawValue = BigInt(item?.value || '0');
    if (rawValue <= 0n) return;

    const discovered = buildPulsechainDiscoveredToken(
      tokenInfo,
      TOKENS.pulsechain,
      discoveredTokens,
      pulseBridgeMap,
    );
    if (discovered.token) {
      discoveredTokens.push(discovered.token);
    }
    if (discovered.pricePatch && !fetchedPrices[discovered.pricePatch.key]?.usd) {
      pricePatches[discovered.pricePatch.key] = { usd: discovered.pricePatch.usd };
    }
  });

  return { discoveredTokens, pricePatches };
}

export async function loadBaseDiscoveredTokens(
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<LoaderResult> {
  const baseBridgeMap: Record<string, { name: string; id: string }> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { name: 'USDC', id: 'usd-coin' },
    '0x4200000000000000000000000000000000000006': { name: 'WETH', id: 'ethereum' },
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { name: 'DAI', id: 'dai' },
  };

  const tokenTransfers = await fetchPagedItems(
    `/addresses/${address}/token-transfers?type=ERC-20`,
    fetchImpl,
    'https://base.blockscout.com/api/v2',
  );

  const discoveredTokens: DiscoveredToken[] = [];
  tokenTransfers.forEach((tx: any) => {
    const discovered = buildBaseDiscoveredToken(
      tx,
      TOKENS.base,
      discoveredTokens,
      baseBridgeMap,
      address,
    );
    if (discovered) discoveredTokens.push(discovered);
  });

  return { discoveredTokens };
}

async function fetchAllEtherscanPages(
  action: string,
  address: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  let retries = 0;
  const apiBase = 'https://api.etherscan.io/v2/api?chainid=1';
  const startBlock = '11565019';
  const pageSize = 10000;
  const sortDir = 'asc';

  while (true) {
    const apiKeyParam = apiKey ? `&apikey=${apiKey}` : '';
    const url = `${apiBase}&module=account&action=${action}&address=${address}`
      + `&startblock=${startBlock}&endblock=99999999&sort=${sortDir}&page=${page}&offset=${pageSize}${apiKeyParam}`;
    const response = await fetchImpl(url);
    const data = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      results.push(...data.result);
      if (data.result.length < pageSize) break;
      page += 1;
      retries = 0;
      continue;
    }

    const msg = (data.result || data.message || '').toString().toLowerCase();
    if ((msg.includes('rate limit') || msg.includes('max rate')) && retries < 3) {
      retries += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500 * retries));
      continue;
    }
    break;
  }

  return results;
}

/**
 * Builds discovered Ethereum tokens from an address's Etherscan token transfer history, selecting a USD price for each token when available.
 *
 * @param address - The Ethereum address whose token transfers will be scanned
 * @param fetchedPrices - Lookup map used to determine a token's USD price; the function checks the token's lowercased contract address first, then the token's CoinGecko id
 * @param apiKey - Etherscan API key used to fetch the token transfer history
 * @returns An object containing `discoveredTokens` — an array of DiscoveredToken objects constructed from the address's token transfer events
 */
export async function loadEthereumDiscoveredTokens(
  address: string,
  fetchedPrices: PriceMap,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<LoaderResult> {
  const tokenTransfers = await fetchAllEtherscanPages('tokentx', address, apiKey, fetchImpl);
  const discoveredTokens: DiscoveredToken[] = [];
  const knownEthereumTokensByAddress = new Map(
    TOKENS.ethereum.map((token) => [token.address.toLowerCase(), token]),
  );

  // Pre-build a Map for O(1) lookups instead of O(N) Array.find per transfer.
  const knownEthTokenByAddress = new Map(
    TOKENS.ethereum.map((token) => [token.address.toLowerCase(), token]),
  );

  tokenTransfers.forEach((tx: any) => {
    const contractAddr = String(tx.contractAddress || '').toLowerCase();
    const symbol = tx.tokenSymbol || 'TOKEN';
    const knownEthToken = knownEthTokenByAddress.get(contractAddr);
    const coinGeckoId = knownEthToken?.coinGeckoId || symbol.toLowerCase();
    const price = fetchedPrices[contractAddr]?.usd || fetchedPrices[coinGeckoId]?.usd || 0;
    const discovered = buildEthereumDiscoveredToken(
      tx,
      TOKENS.ethereum,
      discoveredTokens,
      address,
      coinGeckoId,
      price,
    );
    if (discovered) discoveredTokens.push(discovered);
  });

  return { discoveredTokens };
}

export async function enrichPulsechainDiscoveredTokens(
  discoveredTokens: DiscoveredToken[],
  fetchedPrices: PriceMap,
  fetchImpl: FetchLike = fetch,
): Promise<LoaderResult> {
  const discoveredByAddr = new Map(
    discoveredTokens
      .filter((token) => token.address && token.address !== 'native')
      .map((token) => [token.address.toLowerCase(), token]),
  );
  const unpricedAddrs = getPulsechainDexScreenerLookupAddresses(discoveredTokens, fetchedPrices);
  const chunks: string[][] = [];
  for (let i = 0; i < unpricedAddrs.length; i += 30) {
    chunks.push(unpricedAddrs.slice(i, i + 30));
  }

  const bestPairs = new Map<string, any>();
  await Promise.all(chunks.map(async (chunk) => {
    const response = await fetchImpl(`https://api.dexscreener.com/tokens/v1/pulsechain/${chunk.join(',')}`);
    if (!response.ok) return;
    const pairs = await response.json();
    if (!Array.isArray(pairs)) return;

    pairs.forEach((pair: any) => {
      const baseAddr = pair?.baseToken?.address?.toLowerCase?.();
      const quoteAddr = pair?.quoteToken?.address?.toLowerCase?.();
      const matchedAddr = discoveredByAddr.has(baseAddr) ? baseAddr : discoveredByAddr.has(quoteAddr) ? quoteAddr : null;
      if (!matchedAddr) return;

      const current = bestPairs.get(matchedAddr);
      const currentLiquidity = Number(current?.liquidity?.usd ?? 0);
      const nextLiquidity = Number(pair?.liquidity?.usd ?? 0);
      if (!current || nextLiquidity > currentLiquidity) bestPairs.set(matchedAddr, pair);
    });
  }));

  const logoPatches: Record<string, string> = {};
  bestPairs.forEach((pair, addr) => {
    const token = discoveredByAddr.get(addr);
    if (!token) return;

    const baseAddr = pair?.baseToken?.address?.toLowerCase?.();
    const pairToken = baseAddr === addr ? pair?.baseToken : pair?.quoteToken;
    if (pairToken?.symbol && token.symbol === 'TOKEN') token.symbol = pairToken.symbol;
    if (pairToken?.name && (!token.name || token.name === token.symbol)) token.name = pairToken.name;
    if (pair?.info?.imageUrl) logoPatches[addr] = pair.info.imageUrl;
  });

  return { discoveredTokens, logoPatches };
}

/**
 * Enriches Ethereum discovered tokens with USD price and logo information from DefiLlama.
 *
 * @param discoveredTokens - Discovered tokens to enrich; may be returned unmodified if no lookup keys are needed
 * @param fetchedPrices - Existing price map used to determine which tokens need price lookups
 * @returns An object containing the original `discoveredTokens` and, when available, `pricePatches` (maps both contract addresses and DefiLlama keys to `{ usd, image }`) and `logoPatches` (maps contract addresses to logo URLs)
 */
export async function enrichEthereumDiscoveredTokens(
  discoveredTokens: DiscoveredToken[],
  fetchedPrices: PriceMap,
  fetchImpl: FetchLike = fetch,
): Promise<LoaderResult> {
  const lookupKeys = getEthereumLlamaLookupKeys(discoveredTokens, fetchedPrices);
  if (lookupKeys.length === 0) {
    return { discoveredTokens };
  }

  const data = await fetchDefiLlamaPrices(lookupKeys, fetchImpl);
  const pricePatches: Record<string, PriceEntry> = {};
  const logoPatches: Record<string, string> = {};

  Object.entries(data).forEach(([key, val]: [string, any]) => {
    const addr = key.replace('ethereum:', '');
    pricePatches[addr] = { usd: val.price, image: val.logo };
    pricePatches[key] = { usd: val.price, image: val.logo };
    if (val.logo) logoPatches[addr] = val.logo;
  });

  return { discoveredTokens, pricePatches, logoPatches };
}
