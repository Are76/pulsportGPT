import {
  getPulsechainLPPositions,
  getPulsechainPrices,
  getPulsechainTokenBalances,
  searchPulsechainTokens,
  type PulsechainTokenSearchResult,
} from './adapters/pulsechainAdapter';
import { getEvmTokenBalances } from './adapters/evmAdapter';
import { getEvmPrices } from './adapters/evmPriceAdapter';
import {
  fetchBaseTransactions,
  fetchEthereumTransactions,
  fetchPulsechainTransactions,
} from '../utils/fetchTransactions';
import type { Chain, LpPositionEnriched, PriceQuote, TokenBalance, TransactionQueryResult } from '../types';

interface DataAccessDeps {
  searchPulsechainTokens: (term: string) => Promise<PulsechainTokenSearchResult[]>;
  getPulsechainLPPositions: (addresses: string[], tokenPrices: Record<string, number>) => Promise<LpPositionEnriched[]>;
  getPulsechainTokenBalances: (address: string) => Promise<TokenBalance[]>;
  getEthereumTokenBalances?: (address: string) => Promise<TokenBalance[]>;
  getBaseTokenBalances?: (address: string) => Promise<TokenBalance[]>;
  getPulsechainPrices: (tokenAddresses: string[]) => Promise<PriceQuote[]>;
  getEthereumPrices?: (tokenAddresses: string[]) => Promise<PriceQuote[]>;
  getBasePrices?: (tokenAddresses: string[]) => Promise<PriceQuote[]>;
  getPulsechainTransactions: (address: string, startBlock?: number) => Promise<TransactionQueryResult>;
  getEthereumTransactions?: (address: string, startBlock?: number) => Promise<TransactionQueryResult>;
  getBaseTransactions?: (address: string, startBlock?: number) => Promise<TransactionQueryResult>;
}

function createUnwiredRuntimeDeps(): Omit<DataAccessDeps, 'searchPulsechainTokens'> {
  return {
    async getPulsechainLPPositions() {
      throw new Error('Pulsechain LP position runtime access is not wired yet');
    },
    async getPulsechainTokenBalances() {
      throw new Error('Pulsechain token balance runtime access is not wired yet');
    },
    async getPulsechainPrices() {
      throw new Error('Pulsechain price runtime access is not wired yet');
    },
    async getPulsechainTransactions() {
      throw new Error('Pulsechain transaction runtime access is not wired yet');
    },
  };
}

export function createDataAccess(deps: DataAccessDeps) {
  return {
    async searchTokens(term: string, _chain: Chain): Promise<PulsechainTokenSearchResult[]> {
      return deps.searchPulsechainTokens(term);
    },

    async getLPPositions(
      addresses: string[],
      _chain: Chain,
      tokenPrices: Record<string, number>,
    ): Promise<LpPositionEnriched[]> {
      return deps.getPulsechainLPPositions(addresses, tokenPrices);
    },

    async getTokenBalances(address: string, chain: Chain): Promise<TokenBalance[]> {
      if (chain === 'pulsechain') {
        return deps.getPulsechainTokenBalances(address);
      }
      if (chain === 'ethereum') {
        if (!deps.getEthereumTokenBalances) {
          throw new Error(`Ethereum token balances adapter is not wired`);
        }
        return deps.getEthereumTokenBalances(address);
      }
      if (chain === 'base') {
        if (!deps.getBaseTokenBalances) {
          throw new Error(`Base token balances adapter is not wired`);
        }
        return deps.getBaseTokenBalances(address);
      }
      throw new Error(`Unsupported chain: ${chain}`);
    },

    async getPrices(tokenAddresses: string[], chain: Chain): Promise<PriceQuote[]> {
      if (chain === 'pulsechain') {
        return deps.getPulsechainPrices(tokenAddresses);
      }
      if (chain === 'ethereum') {
        if (!deps.getEthereumPrices) {
          throw new Error(`Ethereum price adapter is not wired`);
        }
        return deps.getEthereumPrices(tokenAddresses);
      }
      if (chain === 'base') {
        if (!deps.getBasePrices) {
          throw new Error(`Base price adapter is not wired`);
        }
        return deps.getBasePrices(tokenAddresses);
      }
      throw new Error(`Unsupported chain: ${chain}`);
    },

    async getTransactions(
      address: string,
      chain: Chain,
      startBlock?: number,
    ): Promise<TransactionQueryResult> {
      if (chain === 'pulsechain') {
        return deps.getPulsechainTransactions(address, startBlock);
      }
      if (chain === 'ethereum') {
        if (!deps.getEthereumTransactions) {
          throw new Error(`Ethereum transaction adapter is not wired`);
        }
        return deps.getEthereumTransactions(address, startBlock);
      }
      if (chain === 'base') {
        if (!deps.getBaseTransactions) {
          throw new Error(`Base transaction adapter is not wired`);
        }
        return deps.getBaseTransactions(address, startBlock);
      }
      throw new Error(`Unsupported chain: ${chain}`);
    },
  };
}

export function createScopedTokenSearchDataAccess() {
  let controller: AbortController | null = null;

  return {
    dataAccess: createDataAccess({
      ...createUnwiredRuntimeDeps(),
      searchPulsechainTokens(term: string) {
        controller?.abort();
        controller = new AbortController();
        return searchPulsechainTokens(term, controller.signal);
      },
    }),
    cancel() {
      controller?.abort();
      controller = null;
    },
  };
}

export const dataAccess = createDataAccess({
  getBasePrices(tokenAddresses: string[]) {
    return getEvmPrices(tokenAddresses, 'base');
  },
  getBaseTokenBalances(address: string) {
    return getEvmTokenBalances('base', address);
  },
  getBaseTransactions(address: string, startBlock?: number) {
    return fetchBaseTransactions(address, { startBlock });
  },
  getEthereumPrices(tokenAddresses: string[]) {
    return getEvmPrices(tokenAddresses, 'ethereum');
  },
  getEthereumTokenBalances(address: string) {
    return getEvmTokenBalances('ethereum', address);
  },
  getEthereumTransactions(address: string, startBlock?: number) {
    return fetchEthereumTransactions(address, {
      startBlock,
      apiKey: import.meta.env.VITE_ETHERSCAN_API_KEY,
    });
  },
  getPulsechainLPPositions,
  getPulsechainPrices,
  getPulsechainTokenBalances,
  getPulsechainTransactions(address: string, startBlock?: number) {
    return fetchPulsechainTransactions(address, { startBlock });
  },
  searchPulsechainTokens,
});

export default dataAccess;
