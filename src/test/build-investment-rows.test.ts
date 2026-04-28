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

  it('maps PulseChain fork-copy stable swap outputs into p-token holdings', () => {
    const currentPDai: Asset = {
      id: 'pdai',
      symbol: 'pDAI',
      name: 'DAI (System Copy)',
      balance: 40000,
      price: 0.0018,
      value: 72,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'eth-in',
        hash: '0xc1',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'ETH',
        amount: 1,
        valueUsd: 2000,
        chain: 'ethereum',
      },
      {
        id: 'bridge-in',
        hash: '0xc2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'WETH (from Ethereum)',
        amount: 1,
        valueUsd: 2000,
        chain: 'pulsechain',
        bridged: true,
      },
      {
        id: 'pdai-buy',
        hash: '0xc3',
        timestamp: 3,
        type: 'swap',
        from: '0xme',
        to: '0xrouter',
        asset: 'DAI (FORK COPY)',
        amount: 40000,
        valueUsd: 2000,
        chain: 'pulsechain',
        counterAsset: 'WETH (from Ethereum)',
        counterAmount: 1,
      },
    ];

    const rows = buildInvestmentRows([currentPDai], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(2000, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'ETH', chain: 'ethereum', amountUsd: 2000 },
    ]);
  });

  it('ignores PulseChain-only deposits as funding sources when no Ethereum/Base inflow exists', () => {
    const currentPls: Asset = {
      id: 'pls',
      symbol: 'PLS',
      name: 'PulseChain',
      balance: 100000,
      price: 0.00008,
      value: 8,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'pulse-airdrop',
        hash: '0xair',
        timestamp: 1,
        type: 'deposit',
        from: '0xexternal',
        to: '0xme',
        asset: 'PLS',
        amount: 100000,
        valueUsd: 8,
        chain: 'pulsechain',
      },
    ];

    const rows = buildInvestmentRows([currentPls], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBe(0);
    expect(rows[0].sourceMix).toEqual([]);
  });

  it('maps Base-bridged PulseChain deposits into Base funding sources', () => {
    const currentUsdc: Asset = {
      id: 'usdc-base-bridge',
      symbol: 'USDC',
      name: 'USDC (from Base)',
      balance: 250,
      price: 1,
      value: 250,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'base-usdc-in',
        hash: '0xb1',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'USDC',
        amount: 250,
        valueUsd: 250,
        chain: 'base',
      },
      {
        id: 'pulse-usdc-bridge',
        hash: '0xb2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'USDC (from Base)',
        amount: 250,
        valueUsd: 250,
        chain: 'pulsechain',
        bridged: true,
      },
    ];

    const rows = buildInvestmentRows([currentUsdc], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(250, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'USDC', chain: 'base', amountUsd: 250 },
    ]);
    expect(rows[0].routeSummary).toContain('Base bridge');
  });

  it('maps Liberty Bridge stable deposits into Ethereum funding sources', () => {
    const currentUsdc: Asset = {
      id: 'usdc-liberty-bridge',
      symbol: 'USDC',
      name: 'USDC (Liberty Bridge)',
      balance: 400,
      price: 1,
      value: 400,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'eth-usdc-in',
        hash: '0xc1',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'USDC',
        amount: 400,
        valueUsd: 400,
        chain: 'ethereum',
      },
      {
        id: 'pulse-usdc-liberty',
        hash: '0xc2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'USDC (Liberty Bridge)',
        amount: 400,
        valueUsd: 400,
        chain: 'pulsechain',
        bridged: true,
      },
    ];

    const rows = buildInvestmentRows([currentUsdc], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(400, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'USDC', chain: 'ethereum', amountUsd: 400 },
    ]);
  });

  it('prefers structured bridge metadata over asset-name parsing for Base bridge deposits', () => {
    const currentUsdc: Asset = {
      id: 'usdc-bridge-meta',
      symbol: 'USDC',
      name: 'USDC',
      balance: 250,
      price: 1,
      value: 250,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'base-usdc-in-meta',
        hash: '0xd1',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'USDC',
        amount: 250,
        valueUsd: 250,
        chain: 'base',
      },
      {
        id: 'pulse-usdc-bridge-meta',
        hash: '0xd2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'USDC',
        amount: 250,
        valueUsd: 250,
        chain: 'pulsechain',
        bridged: true,
        bridge: {
          originChain: 'base',
          protocol: 'official',
        },
      },
    ];

    const rows = buildInvestmentRows([currentUsdc], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(250, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'USDC', chain: 'base', amountUsd: 250 },
    ]);
    expect(rows[0].routeSummary).toContain('Base official bridge');
  });

  it('uses bridge metadata for Liberty deposits even when the asset label is generic', () => {
    const currentUsdc: Asset = {
      id: 'usdc-liberty-meta',
      symbol: 'USDC',
      name: 'USDC',
      balance: 400,
      price: 1,
      value: 400,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'eth-usdc-in-meta',
        hash: '0xe1',
        timestamp: 1,
        type: 'deposit',
        from: '0xext',
        to: '0xme',
        asset: 'USDC',
        amount: 400,
        valueUsd: 400,
        chain: 'ethereum',
      },
      {
        id: 'pulse-usdc-liberty-meta',
        hash: '0xe2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'USDC',
        amount: 400,
        valueUsd: 400,
        chain: 'pulsechain',
        bridged: true,
        bridge: {
          originChain: 'ethereum',
          protocol: 'liberty',
        },
      },
    ];

    const rows = buildInvestmentRows([currentUsdc], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(400, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'USDC', chain: 'ethereum', amountUsd: 400 },
    ]);
    expect(rows[0].routeSummary).toContain('Ethereum liberty bridge');
  });

  it('removes staked HEX cost from liquid holdings on stakeStart', () => {
    const currentLiquidHex: Asset = {
      id: 'hex-liquid',
      symbol: 'HEX',
      name: 'HEX',
      balance: 5000,
      price: 0.12,
      value: 600,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'eth-in-stake-1',
        hash: '0xf1',
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
        id: 'bridge-in-stake-1',
        hash: '0xf2',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'WETH (from Ethereum)',
        amount: 0.5,
        valueUsd: 1000,
        chain: 'pulsechain',
        bridged: true,
        bridge: {
          originChain: 'ethereum',
          protocol: 'official',
        },
      },
      {
        id: 'hex-buy-stake-1',
        hash: '0xf3',
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
      {
        id: 'hex-stake-start',
        hash: '0xf4',
        timestamp: 4,
        type: 'withdraw',
        from: '0xme',
        to: '0xhex',
        asset: 'HEX',
        amount: 5000,
        valueUsd: 500,
        chain: 'pulsechain',
        staking: {
          protocol: 'hex',
          action: 'stakeStart',
        },
      },
    ];

    const rows = buildInvestmentRows([currentLiquidHex], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(500, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'ETH', chain: 'ethereum', amountUsd: 500 },
    ]);
  });

  it('restores HEX cost basis to liquid holdings on stakeEnd', () => {
    const currentLiquidHex: Asset = {
      id: 'hex-liquid-ended',
      symbol: 'HEX',
      name: 'HEX',
      balance: 10000,
      price: 0.12,
      value: 1200,
      chain: 'pulsechain',
    };

    const txs: Transaction[] = [
      {
        id: 'eth-in-stake-2',
        hash: '0xf3',
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
        id: 'bridge-in-stake-2',
        hash: '0xf4',
        timestamp: 2,
        type: 'deposit',
        from: '0xbridge',
        to: '0xme',
        asset: 'WETH (from Ethereum)',
        amount: 0.5,
        valueUsd: 1000,
        chain: 'pulsechain',
        bridged: true,
        bridge: {
          originChain: 'ethereum',
          protocol: 'official',
        },
      },
      {
        id: 'hex-buy-stake-2',
        hash: '0xf5',
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
      {
        id: 'hex-stake-start-2',
        hash: '0xf6',
        timestamp: 4,
        type: 'withdraw',
        from: '0xme',
        to: '0xhex',
        asset: 'HEX',
        amount: 10000,
        valueUsd: 1000,
        chain: 'pulsechain',
        staking: {
          protocol: 'hex',
          action: 'stakeStart',
        },
      },
      {
        id: 'hex-stake-end',
        hash: '0xf7',
        timestamp: 5,
        type: 'deposit',
        from: '0xhex',
        to: '0xme',
        asset: 'HEX',
        amount: 10000,
        valueUsd: 1500,
        chain: 'pulsechain',
        staking: {
          protocol: 'hex',
          action: 'stakeEnd',
        },
      },
    ];

    const rows = buildInvestmentRows([currentLiquidHex], txs, 2000);

    expect(rows).toHaveLength(1);
    expect(rows[0].costBasis).toBeCloseTo(1000, 4);
    expect(rows[0].sourceMix).toEqual([
      { asset: 'ETH', chain: 'ethereum', amountUsd: 1000 },
    ]);
  });
});
