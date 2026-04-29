import { describe, expect, it, vi } from 'vitest';
import type { TokenBalance, TransactionQueryResult } from '../types';
import { loadWalletChainData } from '../features/portfolio/loadWalletChainData';

function createDeps() {
  return {
    getTransactions: vi.fn<(...args: any[]) => Promise<TransactionQueryResult>>(),
    getTokenBalances: vi.fn<(...args: any[]) => Promise<TokenBalance[]>>(),
    loadPulsechainDiscoveredTokens: vi.fn(),
    loadBaseDiscoveredTokens: vi.fn(),
    loadEthereumDiscoveredTokens: vi.fn(),
    enrichPulsechainDiscoveredTokens: vi.fn(),
    enrichEthereumDiscoveredTokens: vi.fn(),
  };
}

describe('loadWalletChainData', () => {
  it('loads pulsechain data and only applies missing usd patches before enrichment', async () => {
    const deps = createDeps();
    deps.getTransactions.mockResolvedValue({ implemented: true, transactions: [{ id: '1' }] as any });
    deps.getTokenBalances.mockResolvedValue([{ address: '0x1', symbol: 'PLS', name: 'PLS', decimals: 18, balance: 1, chain: 'pulsechain' }]);
    deps.loadPulsechainDiscoveredTokens.mockResolvedValue({
      discoveredTokens: [{ address: '0xabc', symbol: 'ABC', name: 'ABC', decimals: 18 }] as any[],
      pricePatches: {
        'pulsechain:0xabc': { usd: 1.25 },
        existing: { usd: 9 },
      },
    });
    deps.enrichPulsechainDiscoveredTokens.mockResolvedValue({
      logoPatches: { '0xabc': 'logo.png' },
    });

    const result = await loadWalletChainData(
      '0xwallet',
      'pulsechain',
      { existing: { usd: 3 } },
      '',
      deps as any,
    );

    expect(result.transactions).toEqual([{ id: '1' }]);
    expect(result.discoveredTokens).toHaveLength(1);
    expect(result.pricePatches).toEqual({ 'pulsechain:0xabc': { usd: 1.25 } });
    expect(result.logoPatches).toEqual({ '0xabc': 'logo.png' });
    expect(deps.enrichPulsechainDiscoveredTokens).toHaveBeenCalledWith(
      result.discoveredTokens,
      expect.objectContaining({
        existing: { usd: 3 },
        'pulsechain:0xabc': { usd: 1.25 },
      }),
    );
  });

  it('loads ethereum data and merges enrichment price patches', async () => {
    const deps = createDeps();
    deps.getTransactions.mockResolvedValue({ implemented: true, transactions: [{ id: 'eth' }] as any });
    deps.getTokenBalances.mockResolvedValue([]);
    deps.loadEthereumDiscoveredTokens.mockResolvedValue({
      discoveredTokens: [{ address: '0xdef', symbol: 'DEF', name: 'DEF', decimals: 18 }] as any[],
    });
    deps.enrichEthereumDiscoveredTokens.mockResolvedValue({
      pricePatches: {
        '0xdef': { usd: 2 },
        'ethereum:0xdef': { usd: 2 },
      },
      logoPatches: { '0xdef': 'eth-logo.png' },
    });

    const result = await loadWalletChainData('0xwallet', 'ethereum', {}, 'api-key', deps as any);

    expect(deps.loadEthereumDiscoveredTokens).toHaveBeenCalledWith('0xwallet', {}, 'api-key');
    expect(deps.getTransactions).toHaveBeenCalledWith('0xwallet', 'ethereum', undefined, 'api-key');
    expect(result.transactions).toEqual([{ id: 'eth' }]);
    expect(result.pricePatches).toEqual({
      '0xdef': { usd: 2 },
      'ethereum:0xdef': { usd: 2 },
    });
    expect(result.logoPatches).toEqual({ '0xdef': 'eth-logo.png' });
  });

  it('still returns core balances when transaction loading fails', async () => {
    const deps = createDeps();
    deps.getTransactions.mockRejectedValue(new Error('boom'));
    deps.getTokenBalances.mockResolvedValue([
      { address: '0x1', symbol: 'USDC', name: 'USDC', decimals: 6, balance: 10, chain: 'base' },
    ]);
    deps.loadBaseDiscoveredTokens.mockResolvedValue({ discoveredTokens: [] });

    const result = await loadWalletChainData('0xwallet', 'base', {}, '', deps as any);

    expect(result.transactions).toEqual([]);
    expect(result.discoveredTokens).toEqual([]);
    expect(result.coreTokenBalances).toHaveLength(1);
  });
});
