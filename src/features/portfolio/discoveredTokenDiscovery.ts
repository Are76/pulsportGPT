export interface DiscoveredToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  coinGeckoId: string;
  bridged?: boolean;
  isSpam: boolean;
  isDiscovered: true;
}

type PricePatch = {
  key: string;
  usd: number;
};

function hasDiscoveredAddress(
  discoveredTokens: DiscoveredToken[],
  address: string,
): boolean {
  return discoveredTokens.some((token) => token.address.toLowerCase() === address.toLowerCase());
}

function hasHardcodedAddress(
  chainTokens: Array<{ address: string }>,
  address: string,
): boolean {
  return chainTokens.some((token) => token.address.toLowerCase() === address.toLowerCase());
}

export function buildPulsechainDiscoveredToken(
  tokenInfo: any,
  chainTokens: Array<{ address: string }>,
  discoveredTokens: DiscoveredToken[],
  bridgeMap: Record<string, { name: string; id: string }>,
  markNoMarketAsSpam = false,
): { token: DiscoveredToken | null; pricePatch?: PricePatch } {
  const contractAddr = String(tokenInfo?.address || '').toLowerCase();
  if (!contractAddr) {
    return { token: null };
  }
  if (hasHardcodedAddress(chainTokens.filter((token) => token.address !== 'native'), contractAddr)) {
    return { token: null };
  }
  if (hasDiscoveredAddress(discoveredTokens, contractAddr)) {
    return { token: null };
  }

  const symbol = String(tokenInfo?.symbol || 'TOKEN');
  const mapped = bridgeMap[contractAddr];
  const name = mapped?.name || String(tokenInfo?.name || symbol);
  const decimals = Number(tokenInfo?.decimals) || 18;
  const exchangeRate = Number(tokenInfo?.exchange_rate ?? tokenInfo?.exchangeRate ?? Number.NaN);
  const hasUrlPattern = /\.(io|com|net|org|xyz|finance|app|pro|gg|gd)\b/i.test(`${name} ${symbol}`);
  const hasNoMarket = !tokenInfo?.exchange_rate && !tokenInfo?.circulating_market_cap && !tokenInfo?.volume_24h;

  return {
    token: {
      symbol,
      name,
      address: tokenInfo.address || contractAddr,
      decimals,
      coinGeckoId: mapped?.id || symbol.toLowerCase(),
      bridged: !!mapped,
      isSpam: hasUrlPattern || (markNoMarketAsSpam && hasNoMarket && !mapped),
      isDiscovered: true,
    },
    ...(Number.isFinite(exchangeRate) && exchangeRate > 0
      ? { pricePatch: { key: `pulsechain:${contractAddr}`, usd: exchangeRate } }
      : {}),
  };
}

export function buildBaseDiscoveredToken(
  tx: any,
  chainTokens: Array<{ address: string }>,
  discoveredTokens: DiscoveredToken[],
  bridgeMap: Record<string, { name: string; id: string }>,
  walletAddress: string,
): DiscoveredToken | null {
  const contractAddr = String(tx.token?.address || '').toLowerCase();
  if (!contractAddr) return null;
  if (hasHardcodedAddress(chainTokens, contractAddr)) return null;
  if (hasDiscoveredAddress(discoveredTokens, contractAddr)) return null;

  const isOut = String(tx.from?.hash || '').toLowerCase() === walletAddress.toLowerCase();
  const symbol = tx.token?.symbol || 'TOKEN';
  const mapped = bridgeMap[contractAddr];
  const name = mapped ? mapped.name : symbol;
  const isBatchAirdrop = tx.method === 'batchTransfer' || tx.method === 'multiSend';
  const hasNoMarket = !tx.token?.exchange_rate && !tx.token?.circulating_market_cap && !tx.token?.volume_24h;

  return {
    symbol,
    name,
    address: tx.token?.address || contractAddr,
    decimals: Number(tx.token?.decimals) || 18,
    coinGeckoId: mapped ? mapped.id : symbol.toLowerCase(),
    bridged: !!mapped,
    isSpam: !isOut && (isBatchAirdrop || (hasNoMarket && !mapped)),
    isDiscovered: true,
  };
}

export function buildEthereumDiscoveredToken(
  tx: any,
  chainTokens: Array<{ address: string }>,
  discoveredTokens: DiscoveredToken[],
  walletAddress: string,
  knownCoinGeckoId?: string,
  knownPriceUsd = 0,
): DiscoveredToken | null {
  const contractAddr = String(tx.contractAddress || '').toLowerCase();
  if (!contractAddr) return null;
  if (hasHardcodedAddress(chainTokens, contractAddr)) return null;
  if (hasDiscoveredAddress(discoveredTokens, contractAddr)) return null;

  const symbol = tx.tokenSymbol || 'TOKEN';
  const name = tx.tokenName || symbol;
  const isOut = String(tx.from || '').toLowerCase() === walletAddress.toLowerCase();
  const amount = Number(tx.value ? tx.value : 0) / 10 ** (Number(tx.tokenDecimal) || 18);
  const hasUrlPattern = /\.(io|com|net|org|xyz|finance|app|pro|gg)\b/i.test(`${name} ${symbol}`);
  const isTinyAirdrop = !isOut && knownPriceUsd === 0 && amount <= 10;

  return {
    symbol,
    name,
    address: tx.contractAddress,
    decimals: Number(tx.tokenDecimal) || 18,
    coinGeckoId: knownCoinGeckoId || symbol.toLowerCase(),
    bridged: false,
    isSpam: !isOut && (hasUrlPattern || isTinyAirdrop),
    isDiscovered: true,
  };
}

export function getPulsechainDexScreenerLookupAddresses(
  discoveredTokens: DiscoveredToken[],
  fetchedPrices: Record<string, { usd?: number } | undefined>,
): string[] {
  return discoveredTokens
    .filter((token) => token.address && token.address !== 'native')
    .map((token) => token.address.toLowerCase())
    .filter((address, index, all) => all.indexOf(address) === index)
    .filter((address) => !fetchedPrices[`pulsechain:${address}`]?.usd);
}

export function getEthereumLlamaLookupKeys(
  discoveredTokens: DiscoveredToken[],
  fetchedPrices: Record<string, { usd?: number } | undefined>,
): string[] {
  return discoveredTokens
    .filter((token) => token.address && token.address !== 'native' && !fetchedPrices[token.address.toLowerCase()]?.usd)
    .map((token) => `ethereum:${token.address.toLowerCase()}`);
}
