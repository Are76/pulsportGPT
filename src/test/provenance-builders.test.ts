import { describe, expect, it } from 'vitest';
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
});
