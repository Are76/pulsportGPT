import { describe, expect, it } from 'vitest';
import {
  buildAssetHistoryIntent,
  matchesHistoryTransactionType,
  resolveHistoryFilterState,
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
      txType: 'swap',
    });
  });

  it('matches typed transaction filters for history views', () => {
    expect(matchesHistoryTransactionType({ type: 'swap', swapLegOnly: false } as any, 'swap')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'swap')).toBe(false);
    expect(matchesHistoryTransactionType({ type: 'deposit' } as any, 'all')).toBe(true);
    expect(matchesHistoryTransactionType({ type: 'withdraw', swapLegOnly: true } as any, 'withdraw')).toBe(false);
  });
});
