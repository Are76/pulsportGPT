import { describe, expect, it } from 'vitest';
import type { Asset, Transaction } from '../types';
import { buildInvestmentRows } from '../utils/buildInvestmentRows';

const currentHex: Asset = {
  id: 'hex',
  symbol: 'HEX',
  name: 'HEX',
  balance: 10000,
  price: 0.12,
  value: 1200,
  chain: 'pulsechain',
};

describe('buildInvestmentRows', () => {
  it('carries ETH source cost through bridge and swap into PulseChain holdings', () => {
    const txs: Transaction[] = [
      {
        id: 'eth-in',
        hash: '0x1',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'ETH',
        amount: 0.5,
        valueUsd: 1000,
        chain: 'ethereum',
      },
      {
        id: 'bridge-in',
        hash: '0x2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'WETH (from Ethereum)',
        amount: 0.5,
        valueUsd: 1000,
        chain: 'pulsechain',
        bridged: true,
      },
      {
        id: 'hex-buy',
        hash: '0x3',
        timestamp: 3,
        type: 'swap',
        from: '0xme',
        to: '0xrouter',
        asset: 'HEX',
        amount: 10000,
        valueUsd: 1000,
        chain: 'pulsechain',
        counterAsset: 'WETH (from Ethereum)',
        counterAmount: 0.5,
      },
    ];

    const rows = buildInvestmentRows([currentHex], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(1000, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'ETH', chain: 'ethereum', amountUsd: 1000 },
    ]);
    expect(rows[0].routeSummary).toContain('WETH -> HEX');
  });

  it('maps bridged DAI on PulseChain to pDAI holdings without double-counting cost', () => {
    const currentPDai: Asset = {
      id: 'pdai',
      symbol: 'pDAI',
      name: 'DAI (from Ethereum)',
      balance: 500,
      price: 1,
      value: 500,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'dai-in',
        hash: '0xa',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'DAI',
        amount: 500,
        valueUsd: 500,
        chain: 'ethereum',
      },
      {
        id: 'pdai-in',
        hash: '0xb',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'DAI (from Ethereum)',
        amount: 500,
        valueUsd: 500,
        chain: 'pulsechain',
        bridged: true,
      },
    ];

    const rows = buildInvestmentRows([currentPDai], txs, 2000);

    expect(rows[0].costBasis).toBeCloseTo(500, 4);
    expect(rows[0].sourceMix[0]).toEqual({ asset: 'DAI', chain: 'ethereum', amountUsd: 500 });
  });
});
