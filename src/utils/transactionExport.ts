import type { Transaction } from '../types';

export function buildTransactionExportRows(transactions: Transaction[]): {
  headers: string[];
  rows: (string | number)[][];
} {
  return {
    headers: [
      'Date',
      'Type',
      'Asset',
      'Amount',
      'Counter Asset',
      'Counter Amount',
      'Value USD',
      'Chain',
      'Hash',
      'Bridge Origin',
      'Bridge Protocol',
      'Staking Protocol',
      'Staking Action',
    ],
    rows: transactions.map((tx) => [
      new Date(tx.timestamp).toISOString().slice(0, 10),
      tx.type,
      tx.asset,
      tx.amount,
      tx.counterAsset ?? '',
      tx.counterAmount ?? '',
      tx.valueUsd ?? '',
      tx.chain,
      tx.hash ?? '',
      tx.bridge?.originChain ?? '',
      tx.bridge?.protocol ?? '',
      tx.staking?.protocol ?? '',
      tx.staking?.action ?? '',
    ]),
  };
}

export function buildTransactionExportJson(transactions: Transaction[]): string {
  return JSON.stringify(transactions, null, 2);
}
