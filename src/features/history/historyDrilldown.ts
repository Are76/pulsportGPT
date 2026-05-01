import type { Chain, InvestmentHoldingRow, Transaction } from '../../types';

export type HistoryTransactionTypeFilter = 'all' | 'deposit' | 'withdraw' | 'swap' | 'interaction';
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
  txTypeFilter: 'all',
  txAssetFilter: 'all',
  txYearFilter: 'all',
  txCoinCategory: 'all',
  txChainFilter: 'all',
  txBridgeProtocolFilter: 'all',
  txOriginChainFilter: 'all',
  txStakingActionFilter: 'all',
};

/**
 * Produce a HistoryFilterState configured from a HistoryDrilldownIntent.
 *
 * Sets the filter fields that correspond to the intent's kind and values; any fields
 * not specified by the intent are populated from DEFAULT_HISTORY_FILTER_STATE or
 * other sensible defaults (for example, asset defaults to `'all'` or `'HEX'` where applicable).
 *
 * @param intent - The drilldown intent describing which filters to apply
 * @returns A HistoryFilterState with relevant fields overridden to reflect `intent`
 */
export function resolveHistoryFilterState(intent: HistoryDrilldownIntent): HistoryFilterState {
  switch (intent.kind) {
    case 'asset':
      return {
        ...DEFAULT_HISTORY_FILTER_STATE,
        txTypeFilter: intent.txType ?? 'all',
        txAssetFilter: intent.symbol,
        txChainFilter: intent.chain ?? DEFAULT_HISTORY_FILTER_STATE.txChainFilter,
      };
    case 'chain':
      return {
        ...DEFAULT_HISTORY_FILTER_STATE,
        txTypeFilter: intent.txType ?? 'all',
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

/**
 * Create a history drilldown intent focused on a specific asset.
 *
 * @param row - Object containing `symbol` and `chain` to target the intent
 * @returns A `HistoryDrilldownIntent` with `kind: 'asset'`, `symbol` and `chain` taken from `row`, and `txType` set to `'all'`
 */
export function buildAssetHistoryIntent(row: Pick<InvestmentHoldingRow, 'symbol' | 'chain'>): HistoryDrilldownIntent {
  return {
    kind: 'asset',
    symbol: row.symbol,
    chain: row.chain,
    txType: 'all',
  };
}

/**
 * Determine whether a transaction satisfies a given history transaction type filter.
 *
 * Matches semantics:
 * - `'all'` — always matches.
 * - `'interaction'` — matches when `tx.type === 'interaction'`.
 * - `'swap'` — matches when `tx.type === 'swap'` or when the transaction is a swap-leg-only (`tx.swapLegOnly`).
 * - `'withdraw'` — matches when `tx.type === 'withdraw'` and not a swap-leg-only.
 * - other specific types — matches when `tx.type` equals the filter and the transaction is not a swap-leg-only.
 *
 * @param tx - The transaction to test.
 * @param filter - The history transaction type filter to apply.
 * @returns `true` if the transaction satisfies the filter, `false` otherwise.
 */
export function matchesHistoryTransactionType(
  tx: Transaction,
  filter: HistoryTransactionTypeFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'interaction') return tx.type === 'interaction';
  if (filter === 'swap') return tx.type === 'swap' || !!tx.swapLegOnly;
  if (filter === 'withdraw') return tx.type === 'withdraw' && !tx.swapLegOnly;
  return tx.type === filter && !tx.swapLegOnly;
}
