import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { buildTransactionExportRows, buildTransactionExportJson } from '../utils/transactionExport';

describe('transaction export', () => {
  const txs: Transaction[] = [
    {
      id: 'bridge-tx',
      hash: '0xbridge',
      timestamp: new Date('2026-04-24T12:00:00Z').getTime(),
      type: 'deposit',
      from: '0xbridge',
      to: '0xwallet',
      asset: 'USDC',
      amount: 250,
      chain: 'pulsechain',
      valueUsd: 250,
      bridged: true,
      bridge: {
        originChain: 'base',
        protocol: 'official',
      },
    },
    {
      id: 'stake-tx',
      hash: '0xstake',
      timestamp: new Date('2026-04-24T13:00:00Z').getTime(),
      type: 'withdraw',
      from: '0xwallet',
      to: '0xhex',
      asset: 'HEX',
      amount: 10000,
      chain: 'pulsechain',
      staking: {
        protocol: 'hex',
        action: 'stakeStart',
      },
    },
  ];

  it('includes bridge and staking fields in export rows', () => {
    const { headers, rows } = buildTransactionExportRows(txs);

    expect(headers).toEqual([
      'Date', 'Type', 'Asset', 'Amount', 'Counter Asset', 'Counter Amount', 'Value USD', 'Chain', 'Hash',
      'Bridge Origin', 'Bridge Protocol', 'Staking Protocol', 'Staking Action',
    ]);

    expect(rows).toEqual([
      ['2026-04-24', 'deposit', 'USDC', 250, '', '', 250, 'pulsechain', '0xbridge', 'base', 'official', '', ''],
      ['2026-04-24', 'withdraw', 'HEX', 10000, '', '', '', 'pulsechain', '0xstake', '', '', 'hex', 'stakeStart'],
    ]);
  });

  it('serializes transaction exports as JSON with metadata intact', () => {
    const json = buildTransactionExportJson(txs);
    expect(JSON.parse(json)).toEqual([
      expect.objectContaining({
        hash: '0xbridge',
        bridge: {
          originChain: 'base',
          protocol: 'official',
        },
      }),
      expect.objectContaining({
        hash: '0xstake',
        staking: {
          protocol: 'hex',
          action: 'stakeStart',
        },
      }),
    ]);
  });
});
