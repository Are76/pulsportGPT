import { describe, expect, it, vi } from 'vitest';
import { buildDerivedMetricProvenance, buildTransactionAmountDescriptor } from '../features/provenance/builders';
import type { Transaction } from '../types';

describe('provenance builders', () => {
  it('builds derived metrics with formula and inputs', () => {
    const descriptor = buildDerivedMetricProvenance({
      label: 'Alpha',
      value: '+3.4%',
      formula: 'Alpha = portfolio return − benchmark return.',
      inputs: [
        { label: 'Portfolio return', value: '+8.0%' },
        { label: 'Benchmark return', value: '+4.6%' },
      ],
    });

    expect(descriptor.primarySource.kind).toBe('analytics');
    expect(descriptor.formula).toContain('Alpha');
    expect(descriptor.inputs).toHaveLength(2);
  });

  it('builds transaction provenance with explorer source and actions', () => {
    const tx: Transaction = {
      id: 'tx-1',
      hash: '0xabc123',
      timestamp: Date.now(),
      type: 'swap',
      from: '0xme',
      to: '0xrouter',
      asset: 'HEX',
      amount: 100,
      counterAsset: 'USDC',
      counterAmount: 10,
      chain: 'pulsechain',
    };

    const descriptor = buildTransactionAmountDescriptor(tx);

    expect(descriptor.primarySource.kind).toBe('explorer');
    expect(descriptor.primarySource.href).toContain('/tx/0xabc123');
    expect(descriptor.actions?.some((action) => action.kind === 'external')).toBe(true);
  });

  it('builds interaction transaction provenance with contract call description', () => {
    const tx = {
      id: 'tx-interaction',
      hash: '0xinteraction',
      timestamp: Date.now(),
      type: 'interaction' as const,
      from: '0xwallet',
      to: '0xcontract',
      asset: 'ETH',
      amount: 0,
      chain: 'ethereum',
    } as unknown as Transaction;

    const descriptor = buildTransactionAmountDescriptor(tx);

    expect(descriptor.label).toBe('ETH amount');
    expect(descriptor.primarySource.kind).toBe('explorer');
    // The detail field of the primary source should reference the interaction
    expect(descriptor.primarySource.detail).toContain('Contract interaction from');
    expect(descriptor.primarySource.detail).toContain('0xwallet');
    expect(descriptor.primarySource.detail).toContain('0xcontract');
  });

  it('uses a swap description for swap transactions with a counterAsset', () => {
    const tx: Transaction = {
      id: 'tx-swap',
      hash: '0xswap',
      timestamp: Date.now(),
      type: 'swap',
      from: '0xme',
      to: '0xrouter',
      asset: 'HEX',
      amount: 1000,
      counterAsset: 'PLS',
      counterAmount: 5000,
      chain: 'pulsechain',
    };

    const descriptor = buildTransactionAmountDescriptor(tx);

    expect(descriptor.primarySource.detail).toContain('Paid 5,000 PLS');
    expect(descriptor.primarySource.detail).toContain('received 1,000 HEX');
  });

  it('uses a plain deposit description for non-swap, non-interaction transactions', () => {
    const tx: Transaction = {
      id: 'tx-deposit',
      hash: '0xdeposit',
      timestamp: Date.now(),
      type: 'deposit',
      from: '0xexternal',
      to: '0xwallet',
      asset: 'USDC',
      amount: 500,
      chain: 'ethereum',
    };

    const descriptor = buildTransactionAmountDescriptor(tx);

    expect(descriptor.primarySource.detail).toContain('deposit 500 USDC');
  });

  it('includes an optional drilldown action when onDrilldown callback is provided', () => {
    const onDrilldown = vi.fn();
    const tx: Transaction = {
      id: 'tx-drill',
      hash: '0xdrill',
      timestamp: Date.now(),
      type: 'deposit',
      from: '0xexternal',
      to: '0xwallet',
      asset: 'USDC',
      amount: 500,
      chain: 'ethereum',
    };

    const descriptor = buildTransactionAmountDescriptor(tx, { onDrilldown });

    const drilldownAction = descriptor.actions?.find((a) => a.kind === 'drilldown');
    expect(drilldownAction).toBeDefined();
    expect(drilldownAction?.label).toContain('USDC');
    drilldownAction?.onSelect?.();
    expect(onDrilldown).toHaveBeenCalledTimes(1);
  });

  it('does not include drilldown action when onDrilldown is not provided', () => {
    const tx: Transaction = {
      id: 'tx-no-drill',
      hash: '0xnodrill',
      timestamp: Date.now(),
      type: 'deposit',
      from: '0xexternal',
      to: '0xwallet',
      asset: 'HEX',
      amount: 1000,
      chain: 'pulsechain',
    };

    const descriptor = buildTransactionAmountDescriptor(tx);
    const drilldownActions = descriptor.actions?.filter((a) => a.kind === 'drilldown') ?? [];
    expect(drilldownActions).toHaveLength(0);
  });
});
