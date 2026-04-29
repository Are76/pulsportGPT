import { dataAccess } from '../../services/dataAccess';
import type { Chain, TokenBalance, Transaction } from '../../types';
import {
  enrichEthereumDiscoveredTokens,
  enrichPulsechainDiscoveredTokens,
  loadBaseDiscoveredTokens,
  loadEthereumDiscoveredTokens,
  loadPulsechainDiscoveredTokens,
} from './discoveredTokenLoader';
import type { DiscoveredToken } from './discoveredTokenDiscovery';

type PriceEntry = { usd?: number; image?: string };
type PriceMap = Record<string, PriceEntry | undefined>;

type LoaderDeps = {
  getTransactions: typeof dataAccess.getTransactions;
  getTokenBalances: typeof dataAccess.getTokenBalances;
  loadPulsechainDiscoveredTokens: typeof loadPulsechainDiscoveredTokens;
  loadBaseDiscoveredTokens: typeof loadBaseDiscoveredTokens;
  loadEthereumDiscoveredTokens: typeof loadEthereumDiscoveredTokens;
  enrichPulsechainDiscoveredTokens: typeof enrichPulsechainDiscoveredTokens;
  enrichEthereumDiscoveredTokens: typeof enrichEthereumDiscoveredTokens;
};

export type WalletChainLoadResult = {
  coreTokenBalances: TokenBalance[];
  discoveredTokens: DiscoveredToken[];
  logoPatches: Record<string, string>;
  pricePatches: Record<string, PriceEntry>;
  transactions: Transaction[];
};

const defaultDeps: LoaderDeps = {
  getTransactions: dataAccess.getTransactions,
  getTokenBalances: dataAccess.getTokenBalances,
  loadPulsechainDiscoveredTokens,
  loadBaseDiscoveredTokens,
  loadEthereumDiscoveredTokens,
  enrichPulsechainDiscoveredTokens,
  enrichEthereumDiscoveredTokens,
};

function mergeMissingUsdPrices(target: Record<string, PriceEntry>, source: Record<string, PriceEntry> | undefined, fetchedPrices: PriceMap) {
  Object.entries(source || {}).forEach(([key, value]) => {
    if (!fetchedPrices[key]?.usd) {
      target[key] = { ...(target[key] || {}), ...value };
    }
  });
}

function buildPriceContext(fetchedPrices: PriceMap, pricePatches: Record<string, PriceEntry>): PriceMap {
  return { ...fetchedPrices, ...pricePatches };
}

export async function loadWalletChainData(
  address: string,
  chain: Chain,
  fetchedPrices: PriceMap,
  etherscanApiKey: string,
  deps: LoaderDeps = defaultDeps,
): Promise<WalletChainLoadResult> {
  const discoveredTokens: DiscoveredToken[] = [];
  const pricePatches: Record<string, PriceEntry> = {};
  const logoPatches: Record<string, string> = {};
  let transactions: Transaction[] = [];

  try {
    if (chain === 'pulsechain') {
      const [transactionResult, discovery] = await Promise.all([
        deps.getTransactions(address, 'pulsechain'),
        deps.loadPulsechainDiscoveredTokens(address, fetchedPrices),
      ]);
      transactions = transactionResult.transactions;
      discoveredTokens.push(...discovery.discoveredTokens);
      mergeMissingUsdPrices(pricePatches, discovery.pricePatches, fetchedPrices);

      if (discoveredTokens.length > 0) {
        const enrichment = await deps.enrichPulsechainDiscoveredTokens(
          discoveredTokens,
          buildPriceContext(fetchedPrices, pricePatches),
        );
        Object.assign(logoPatches, enrichment.logoPatches || {});
      }
    } else if (chain === 'base') {
      const [transactionResult, discovery] = await Promise.all([
        deps.getTransactions(address, 'base'),
        deps.loadBaseDiscoveredTokens(address),
      ]);
      transactions = transactionResult.transactions;
      discoveredTokens.push(...discovery.discoveredTokens);
    } else {
      const [transactionResult, discovery] = await Promise.all([
        deps.getTransactions(address, 'ethereum', undefined, etherscanApiKey),
        deps.loadEthereumDiscoveredTokens(address, fetchedPrices, etherscanApiKey),
      ]);
      transactions = transactionResult.transactions;
      discoveredTokens.push(...discovery.discoveredTokens);

      if (discoveredTokens.length > 0) {
        const enrichment = await deps.enrichEthereumDiscoveredTokens(discoveredTokens, fetchedPrices);
        Object.entries(enrichment.pricePatches || {}).forEach(([key, value]) => {
          pricePatches[key] = { ...(pricePatches[key] || {}), ...value };
        });
        Object.assign(logoPatches, enrichment.logoPatches || {});
      }
    }
  } catch (error) {
    console.warn(`Could not fetch transactions for ${address} on ${chain}:`, error);
  }

  const coreTokenBalances = await deps.getTokenBalances(address, chain);
  return {
    coreTokenBalances,
    discoveredTokens,
    logoPatches,
    pricePatches,
    transactions,
  };
}
