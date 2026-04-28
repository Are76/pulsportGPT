import { describe, expect, it } from 'vitest';
import {
  buildBaseDiscoveredToken,
  buildEthereumDiscoveredToken,
  buildPulsechainDiscoveredToken,
  getEthereumLlamaLookupKeys,
  getPulsechainDexScreenerLookupAddresses,
  type DiscoveredToken,
} from '../features/portfolio/discoveredTokenDiscovery';

describe('discoveredTokenDiscovery', () => {
  it('builds PulseChain discovered tokens with bridge metadata and exchange-rate price patches', () => {
    const result = buildPulsechainDiscoveredToken(
      {
        address: '0x41527c4d9d47ef03f00f77d794c87ba94832700b',
        symbol: 'USDC',
        name: 'USDC',
        decimals: '6',
        exchange_rate: '1.01',
      },
      [{ address: 'native' }],
      [],
      {
        '0x41527c4d9d47ef03f00f77d794c87ba94832700b': { name: 'USDC (from Base)', id: 'usd-coin' },
      },
    );

    expect(result).toEqual({
      token: {
        symbol: 'USDC',
        name: 'USDC (from Base)',
        address: '0x41527c4d9d47ef03f00f77d794c87ba94832700b',
        decimals: 6,
        coinGeckoId: 'usd-coin',
        bridged: true,
        isSpam: false,
        isDiscovered: true,
      },
      pricePatch: {
        key: 'pulsechain:0x41527c4d9d47ef03f00f77d794c87ba94832700b',
        usd: 1.01,
      },
    });
  });

  it('builds Base discovered tokens and flags inbound no-market airdrops as spam', () => {
    const result = buildBaseDiscoveredToken(
      {
        from: { hash: '0xexternal' },
        token: {
          address: '0xfeed',
          symbol: 'DROP',
          decimals: '18',
        },
      },
      [{ address: 'native' }],
      [],
      {},
      '0xwallet',
    );

    expect(result).toEqual({
      symbol: 'DROP',
      name: 'DROP',
      address: '0xfeed',
      decimals: 18,
      coinGeckoId: 'drop',
      bridged: false,
      isSpam: true,
      isDiscovered: true,
    });
  });

  it('builds Ethereum discovered tokens and ignores hardcoded tokens', () => {
    const first = buildEthereumDiscoveredToken(
      {
        from: '0xexternal',
        contractAddress: '0xabc',
        tokenSymbol: 'NEW',
        tokenDecimal: '18',
        value: '5000000000000000000',
      },
      [{ address: 'native' }],
      [],
      '0xwallet',
      'new-token',
      0,
    );

    const second = buildEthereumDiscoveredToken(
      {
        from: '0xexternal',
        contractAddress: '0xabc',
        tokenSymbol: 'NEW',
        tokenDecimal: '18',
        value: '5000000000000000000',
      },
      [{ address: '0xabc' }],
      [],
      '0xwallet',
      'new-token',
      0,
    );

    expect(first?.coinGeckoId).toBe('new-token');
    expect(second).toBeNull();
  });

  it('collects lookup keys only for unpriced discovered tokens', () => {
    const discoveredTokens: DiscoveredToken[] = [
      {
        symbol: 'AAA',
        name: 'AAA',
        address: '0xaaa',
        decimals: 18,
        coinGeckoId: 'aaa',
        isSpam: false,
        isDiscovered: true,
      },
      {
        symbol: 'BBB',
        name: 'BBB',
        address: '0xbbb',
        decimals: 18,
        coinGeckoId: 'bbb',
        isSpam: false,
        isDiscovered: true,
      },
    ];

    expect(getPulsechainDexScreenerLookupAddresses(discoveredTokens, {
      'pulsechain:0xbbb': { usd: 1 },
    })).toEqual(['0xaaa']);

    expect(getEthereumLlamaLookupKeys(discoveredTokens, {
      '0xbbb': { usd: 2 },
    })).toEqual(['ethereum:0xaaa']);
  });
});
