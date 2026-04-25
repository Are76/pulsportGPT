import type { PulsechainTokenSearchResult } from './adapters/pulsechainAdapter';
import type { Chain, LpPosition, PriceQuote, TokenBalance, TransactionQueryResult } from '../types';

interface DataAccessDeps {
  searchPulsechainTokens: (term: string) => Promise<PulsechainTokenSearchResult[]>;
  getPulsechainLPPositions: (addresses: string[], tokenPrices: Record<string, number>) => Promise<LpPosition[]>;
  getPulsechainTokenBalances: (address: string) => Promise<TokenBalance[]>;
  getPulsechainPrices: (tokenAddresses: string[]) => Promise<PriceQuote[]>;
}

function assertPhase1Chain(chain: Chain): void {
  if (chain !== 'pulsechain') {
    throw new Error(`Unsupported chain for Phase 1 data access: ${chain}`);
  }
}

export function createDataAccess(deps: DataAccessDeps) {
  return {
    async searchTokens(term: string, chain: Chain): Promise<PulsechainTokenSearchResult[]> {
      assertPhase1Chain(chain);
      return deps.searchPulsechainTokens(term);
    },

    async getLPPositions(
      addresses: string[],
      chain: Chain,
      tokenPrices: Record<string, number>,
    ): Promise<LpPosition[]> {
      assertPhase1Chain(chain);
      return deps.getPulsechainLPPositions(addresses, tokenPrices);
    },

    async getTokenBalances(address: string, chain: Chain): Promise<TokenBalance[]> {
      assertPhase1Chain(chain);
      return deps.getPulsechainTokenBalances(address);
    },

    async getPrices(tokenAddresses: string[], chain: Chain): Promise<PriceQuote[]> {
      assertPhase1Chain(chain);
      return deps.getPulsechainPrices(tokenAddresses);
    },

    async getTransactions(
      address: string,
      chain: Chain,
      startBlock?: number,
    ): Promise<TransactionQueryResult> {
      assertPhase1Chain(chain);
      void address;
      void startBlock;

      return {
        implemented: false,
        transactions: [],
        nextBlock: undefined,
      };
    },
  };
}
