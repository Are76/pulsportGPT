import { describe, expect, it } from 'vitest';
import {
  buildAssetHistoryIntent,
  matchesHistoryTransactionType,
  resolveHistoryFilterState,
  DEFAULT_HISTORY_FILTER_STATE,
  type HistoryDrilldownIntent,
} from '../features/history/historyDrilldown';

describe('resolveHistoryFilterState', () => {
  it('maps asset drill-downs to asset and chain history filters', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'asset',
      symbol: 'ETH',
      chain: 'ethereum',
      txType: 'swap',
    };

    expect(resolveHistoryFilterState(intent)).toMatchObject({
      txTypeFilter: 'swap',
      txAssetFilter: 'ETH',
      txChainFilter: 'ethereum',
      txBridgeProtocolFilter: 'all',
      txStakingActionFilter: 'all',
    });
  });

  it('defaults asset intent txType to "all" when no txType is specified', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'asset',
      symbol: 'PLSX',
      chain: 'pulsechain',
    };

    expect(resolveHistoryFilterState(intent)).toMatchObject({
      txTypeFilter: 'all',
      txAssetFilter: 'PLSX',
      txChainFilter: 'pulsechain',
    });
  });

  it('defaults asset intent txChainFilter to "all" when no chain is specified', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'asset',
      symbol: 'WBTC',
    };

    const state = resolveHistoryFilterState(intent);
    expect(state.txTypeFilter).toBe('all');
    expect(state.txAssetFilter).toBe('WBTC');
    expect(state.txChainFilter).toBe('all');
  });

  it('maps chain drill-downs to chain and type filters', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'chain',
      chain: 'pulsechain',
      txType: 'swap',
    };

    expect(resolveHistoryFilterState(intent)).toMatchObject({
      txTypeFilter: 'swap',
      txChainFilter: 'pulsechain',
      txAssetFilter: 'all',
      txBridgeProtocolFilter: 'all',
    });
  });

  it('defaults chain intent txType to "all" when no txType is specified', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'chain',
      chain: 'ethereum',
    };

    expect(resolveHistoryFilterState(intent)).toMatchObject({
      txTypeFilter: 'all',
      txChainFilter: 'ethereum',
    });
  });

  it('maps bridge drill-downs to bridge-aware history filters', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'bridge',
      protocol: 'liberty',
      originChain: 'base',
      symbol: 'USDC',
    };

    expect(resolveHistoryFilterState(intent)).toMatchObject({
      txTypeFilter: 'all',
      txAssetFilter: 'USDC',
      txBridgeProtocolFilter: 'liberty',
      txOriginChainFilter: 'base',
    });
  });

  it('maps staking drill-downs to asset and staking action filters', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'staking',
      protocol: 'hex',
      action: 'stakeStart',
      chain: 'pulsechain',
    };

    expect(resolveHistoryFilterState(intent)).toMatchObject({
      txAssetFilter: 'HEX',
      txChainFilter: 'pulsechain',
      txStakingActionFilter: 'stakeStart',
    });
  });

  it('defaults staking intent asset to "HEX" when no symbol is provided', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'staking',
      protocol: 'hex',
    };

    expect(resolveHistoryFilterState(intent).txAssetFilter).toBe('HEX');
  });

  it('preserves all default filter state fields not overridden by the intent', () => {
    const intent: HistoryDrilldownIntent = {
      kind: 'asset',
      symbol: 'INC',
      chain: 'pulsechain',
    };

    const state = resolveHistoryFilterState(intent);
    expect(state.txYearFilter).toBe(DEFAULT_HISTORY_FILTER_STATE.txYearFilter);
    expect(state.txCoinCategory).toBe(DEFAULT_HISTORY_FILTER_STATE.txCoinCategory);
    expect(state.txBridgeProtocolFilter).toBe(DEFAULT_HISTORY_FILTER_STATE.txBridgeProtocolFilter);
    expect(state.txOriginChainFilter).toBe(DEFAULT_HISTORY_FILTER_STATE.txOriginChainFilter);
    expect(state.txStakingActionFilter).toBe(DEFAULT_HISTORY_FILTER_STATE.txStakingActionFilter);
  });
});

describe('history drill-down helpers', () => {
  it('builds asset intents from holding rows', () => {
    expect(
      buildAssetHistoryIntent({
        symbol: 'HEX',
        chain: 'pulsechain',
      }),
    ).toEqual({
      kind: 'asset',
      symbol: 'HEX',
      chain: 'pulsechain',
      txType: 'all',
    });
  });

  it('buildAssetHistoryIntent always sets txType to "all" regardless of input', () => {
    const intent = buildAssetHistoryIntent({ symbol: 'PLSX', chain: 'pulsechain' });
    expect(intent.txType).toBe('all');
  });

  it('matches typed transaction filters for history views', () => {
    expect(matchesHistoryTransactionType({ type: 'swap', swapLegOnly: false } as any, 'swap')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'swap')).toBe(false);
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'all')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'withdraw', swapLegOnly: true } as any, 'withdraw')).toBe(false);
    expect(matchesHistoryTransactionType({ type: 'interaction' } as any, 'interaction')).toBe(true);
  });

  it('matches swap-leg-only transactions under the swap filter', () => {
    expect(matchesHistoryTransactionType({ type: 'withdraw', swapLegOnly: true } as any, 'swap')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'deposit', swapLegOnly: true } as any, 'swap')).toBe(true);
  });

  it('does not match interaction transactions under swap filter', () => {
    expect(matchesHistoryTransactionType({ type: 'interaction' } as any, 'swap')).toBe(false);
  });

  it('does not match swap-leg-only transactions under interaction filter', () => {
    expect(matchesHistoryTransactionType({ type: 'withdraw', swapLegOnly: true } as any, 'interaction')).toBe(false);
  });

  it('matches deposit transactions only under all or deposit filter', () => {
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'deposit')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'withdraw')).toBe(false);
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'interaction')).toBe(false);
  });

  it('matches non-swap-leg withdraw under withdraw filter', () => {
    expect(matchesHistoryTransactionType({ type: 'withdraw', swapLegOnly: false } as any, 'withdraw')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'withdraw' } as any, 'withdraw')).toBe(true);
  });
});
