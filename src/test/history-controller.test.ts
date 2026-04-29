import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHistoryController } from '../features/history/useHistoryController';
import type { Asset, Transaction } from '../types';

const matchesAssetSymbol = (left: string, right: string): boolean =>
  left.trim().toUpperCase() === right.trim().toUpperCase();

describe('useHistoryController', () => {
  const currentAssets: Asset[] = [
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', balance: 1, price: 3500, value: 3500, chain: 'ethereum' },
    { id: 'hex', symbol: 'HEX', name: 'HEX', balance: 100, price: 1.2, value: 120, chain: 'pulsechain' },
  ];

  const currentTransactions: Transaction[] = [
    {
      id: 'swap-eth',
      hash: '0x1',
      timestamp: Date.UTC(2026, 0, 1),
      type: 'swap',
      from: '0xwallet',
      to: '0xwallet',
      asset: 'ETH',
      amount: 1,
      chain: 'ethereum',
      valueUsd: 3500,
      counterAsset: 'USDC',
      counterAmount: 3500,
    },
    {
      id: 'bridge-usdc',
      hash: '0x2',
      timestamp: Date.UTC(2026, 0, 2),
      type: 'deposit',
      from: '0xbridge',
      to: '0xwallet',
      asset: 'USDC',
      amount: 1000,
      chain: 'pulsechain',
      valueUsd: 1000,
      bridged: true,
      bridge: { originChain: 'base', protocol: 'liberty' },
    },
  ];

  it('applies typed history intents and derives filtered transactions', () => {
    const { result } = renderHook(() =>
      useHistoryController({
        currentAssets,
        currentTransactions,
        selectedWalletAddr: 'all',
        prices: { pulsechain: { usd: 0.00008 } },
        matchesAssetSymbol,
      }),
    );

    act(() => {
      result.current.applyHistoryDrilldownIntent({
        kind: 'chain',
        chain: 'ethereum',
        txType: 'swap',
      });
    });

    expect(result.current.txChainFilter).toBe('ethereum');
    expect(result.current.txTypeFilter).toBe('swap');
    expect(result.current.filteredTransactions).toHaveLength(1);
    expect(result.current.filteredTransactions[0]?.id).toBe('swap-eth');
  });

  it('resets txAssetFilter to all when chain filter changes', () => {
    const { result } = renderHook(() =>
      useHistoryController({
        currentAssets,
        currentTransactions,
        selectedWalletAddr: 'all',
        prices: { pulsechain: { usd: 0.00008 } },
        matchesAssetSymbol,
      }),
    );

    act(() => {
      result.current.setTxAssetFilter('ETH');
    });

    expect(result.current.txAssetFilter).toBe('ETH');

    act(() => {
      result.current.setTxChainFilter('pulsechain');
    });

    expect(result.current.txAssetFilter).toBe('all');
  });

  it('resets filters back to the default history state', () => {
    const { result } = renderHook(() =>
      useHistoryController({
        currentAssets,
        currentTransactions,
        selectedWalletAddr: 'all',
        prices: { pulsechain: { usd: 0.00008 } },
        matchesAssetSymbol,
      }),
    );

    act(() => {
      result.current.applyHistoryDrilldownIntent({
        kind: 'bridge',
        protocol: 'liberty',
        originChain: 'base',
        symbol: 'USDC',
      });
    });

    act(() => {
      result.current.resetHistoryFilters();
    });

    expect(result.current.txTypeFilter).toBe('swap');
    expect(result.current.txAssetFilter).toBe('all');
    expect(result.current.txChainFilter).toBe('pulsechain');
    expect(result.current.txBridgeProtocolFilter).toBe('all');
    expect(result.current.txOriginChainFilter).toBe('all');
  });
});
