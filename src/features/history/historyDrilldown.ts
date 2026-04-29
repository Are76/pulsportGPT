import type { Chain, InvestmentHoldingRow, Transaction } from '../../types';

export type HistoryTransactionTypeFilter = 'all' | 'deposit' | 'withdraw' | 'swap';
export type HistoryBridgeProtocolFilter = 'all' | 'official' | 'liberty';
export type HistoryStakingActionFilter = 'all' | 'stakeStart' | 'stakeEnd';

export interface HistoryFilterState {
  txTypeFilter: HistoryTransactionTypeFilter;
  txAssetFilter: string;
  txYearFilter: string;
  txCoinCategory: string;
  txChainFilter: 'all' | Chain;
  txBridgeProtocolFilter: HistoryBridgeProtocolFilter;
  txOriginChainFilter: 'all' | Chain;
  txStakingActionFilter: HistoryStakingActionFilter;
}

export type HistoryDrilldownIntent =
  | {
      kind: 'asset';
      symbol: string;
      chain?: Chain;
      txType?: HistoryTransactionTypeFilter;
    }
  | {
      kind: 'chain';
      chain: Chain;
      txType?: HistoryTransactionTypeFilter;
    }
  | {
      kind: 'bridge';
      protocol: Exclude<HistoryBridgeProtocolFilter, 'all'>;
      originChain?: Chain;
      symbol?: string;
      txType?: HistoryTransactionTypeFilter;
    }
  | {
      kind: 'staking';
      protocol: 'hex';
      action?: Exclude<HistoryStakingActionFilter, 'all'>;
      chain?: Chain;
      symbol?: string;
      txType?: HistoryTransactionTypeFilter;
    };

export const DEFAULT_HISTORY_FILTER_STATE: HistoryFilterState = {
  txTypeFilter: 'swap',
  txAssetFilter: 'all',
  txYearFilter: 'all',
  txCoinCategory: 'all',
  txChainFilter: 'all',
  txBridgeProtocolFilter: 'all',
  txOriginChainFilter: 'all',
  txStakingActionFilter: 'all',
};

export function resolveHistoryFilterState(intent: HistoryDrilldownIntent): HistoryFilterState {
  switch (intent.kind) {
    case 'asset':
      return {
        ...DEFAULT_HISTORY_FILTER_STATE,
        txTypeFilter: intent.txType ?? 'swap',
        txAssetFilter: intent.symbol,
        txChainFilter: intent.chain ?? DEFAULT_HISTORY_FILTER_STATE.txChainFilter,
      };
    case 'chain':
      return {
        ...DEFAULT_HISTORY_FILTER_STATE,
        txTypeFilter: intent.txType ?? 'swap',
        txChainFilter: intent.chain,
      };
    case 'bridge':
      return {
        ...DEFAULT_HISTORY_FILTER_STATE,
        txTypeFilter: intent.txType ?? 'all',
        txAssetFilter: intent.symbol ?? 'all',
        txBridgeProtocolFilter: intent.protocol,
        txOriginChainFilter: intent.originChain ?? 'all',
      };
    case 'staking':
      return {
        ...DEFAULT_HISTORY_FILTER_STATE,
        txTypeFilter: intent.txType ?? 'all',
        txAssetFilter: intent.symbol ?? 'HEX',
        txChainFilter: intent.chain ?? DEFAULT_HISTORY_FILTER_STATE.txChainFilter,
        txStakingActionFilter: intent.action ?? 'all',
      };
  }
}

export function buildAssetHistoryIntent(row: Pick<InvestmentHoldingRow, 'symbol' | 'chain'>): HistoryDrilldownIntent {
  return {
    kind: 'asset',
    symbol: row.symbol,
    chain: row.chain,
    txType: 'swap',
  };
}

export function matchesHistoryTransactionType(
  tx: Transaction,
  filter: HistoryTransactionTypeFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'swap') return tx.type === 'swap' || !!tx.swapLegOnly;
  if (filter === 'withdraw') return tx.type === 'withdraw' && !tx.swapLegOnly;
  return tx.type === filter && !tx.swapLegOnly;
}
