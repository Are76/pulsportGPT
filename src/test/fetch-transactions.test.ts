import { describe, expect, it, vi } from 'vitest';
import {
  fetchBaseTransactions,
  fetchEthereumTransactions,
  fetchPulsechainTransactions,
} from '../utils/fetchTransactions';

describe('fetchPulsechainTransactions', () => {
  it('merges native transactions and token transfers into normalized PulseChain history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xnativein',
              timestamp: '2026-04-24T10:00:00.000000Z',
              block: 120,
              block_number: 120,
              from: { hash: '0xexternal' },
              to: { hash: '0xwallet' },
              value: '2500000000000000000',
              fee: { value: '21000000000000' },
              status: 'ok',
            },
            {
              hash: '0xswap',
              timestamp: '2026-04-24T11:00:00.000000Z',
              block: 121,
              block_number: 121,
              from: { hash: '0xwallet' },
              to: { hash: '0xrouter' },
              value: '0',
              fee: { value: '42000000000000' },
              status: 'ok',
            },
          ],
          next_page_params: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              transaction_hash: '0xswap',
              timestamp: '2026-04-24T11:00:00.000000Z',
              block_number: 121,
              from: { hash: '0xwallet' },
              to: { hash: '0xrouter' },
              token: {
                address_hash: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c',
                symbol: 'pWETH',
                name: 'Wrapped Ether from Ethereum',
                decimals: '18',
              },
              total: {
                decimals: '18',
                value: '500000000000000000',
              },
              type: 'token_transfer',
            },
            {
              transaction_hash: '0xswap',
              timestamp: '2026-04-24T11:00:00.000000Z',
              block_number: 121,
              from: { hash: '0xrouter' },
              to: { hash: '0xwallet' },
              token: {
                address_hash: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
                symbol: 'HEX',
                name: 'HEX',
                decimals: '8',
              },
              total: {
                decimals: '8',
                value: '1000000000000',
              },
              type: 'token_transfer',
            },
          ],
          next_page_params: null,
        }),
      });

    const result = await fetchPulsechainTransactions('0xWallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.scan.pulsechain.com/api/v2/addresses/0xwallet/transactions',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.scan.pulsechain.com/api/v2/addresses/0xwallet/token-transfers?type=ERC-20',
    );

    expect(result.implemented).toBe(true);
    expect(result.nextBlock).toBeUndefined();
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: '0xswap-swap',
        hash: '0xswap',
        type: 'swap',
        chain: 'pulsechain',
        asset: 'HEX',
        amount: 10000,
        counterAsset: 'WETH (from Ethereum)',
        counterAmount: 0.5,
        bridged: true,
        fee: 0.000042,
        status: 'ok',
      }),
      expect.objectContaining({
        id: '0xnativein-native-deposit',
        hash: '0xnativein',
        type: 'deposit',
        chain: 'pulsechain',
        asset: 'PLS',
        amount: 2.5,
        fee: 0.000021,
        status: 'ok',
      }),
    ]);
  });

  it('filters out transactions below startBlock and surfaces the next page block when available', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xold',
              timestamp: '2026-04-24T09:00:00.000000Z',
              block: 90,
              block_number: 90,
              from: { hash: '0xexternal' },
              to: { hash: '0xwallet' },
              value: '1000000000000000000',
              fee: { value: '21000000000000' },
              status: 'ok',
            },
          ],
          next_page_params: {
            block_number: 89,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          next_page_params: {
            block_number: 88,
          },
        }),
      });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
      startBlock: 100,
    });

    expect(result.transactions).toEqual([]);
    expect(result.nextBlock).toBe(89);
  });

  it('walks paginated Blockscout history until it reaches the start block', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/addresses/0xwallet/transactions')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                hash: '0xpage1',
                timestamp: '2026-04-24T12:00:00.000000Z',
                block_number: 150,
                from: { hash: '0xexternal' },
                to: { hash: '0xwallet' },
                value: '1000000000000000000',
                fee: { value: '21000000000000' },
                status: 'ok',
              },
            ],
            next_page_params: {
              block_number: 120,
              index: 3,
            },
          }),
        };
      }

      if (url.includes('/addresses/0xwallet/transactions?block_number=120&index=3')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                hash: '0xpage2',
                timestamp: '2026-04-24T11:00:00.000000Z',
                block_number: 120,
                from: { hash: '0xwallet' },
                to: { hash: '0xrouter' },
                value: '0',
                fee: { value: '42000000000000' },
                status: 'ok',
              },
            ],
            next_page_params: {
              block_number: 99,
              index: 7,
            },
          }),
        };
      }

      if (url.endsWith('/addresses/0xwallet/token-transfers?type=ERC-20')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                transaction_hash: '0xbridgebase',
                timestamp: '2026-04-24T12:30:00.000000Z',
                block_number: 151,
                from: { hash: '0xbridge' },
                to: { hash: '0xwallet' },
                token: {
                  address_hash: '0x41527c4d9d47ef03f00f77d794c87ba94832700b',
                  symbol: 'USDC',
                  name: 'USDC',
                  decimals: '6',
                },
                total: {
                  decimals: '6',
                  value: '250000000',
                },
                log_index: 1,
              },
            ],
            next_page_params: {
              block_number: 120,
            },
          }),
        };
      }

      if (url.includes('/addresses/0xwallet/token-transfers?type=ERC-20&block_number=120')) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            next_page_params: null,
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
      startBlock: 120,
    });

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://api.scan.pulsechain.com/api/v2/addresses/0xwallet/transactions',
      'https://api.scan.pulsechain.com/api/v2/addresses/0xwallet/token-transfers?type=ERC-20',
      'https://api.scan.pulsechain.com/api/v2/addresses/0xwallet/transactions?block_number=120&index=3',
      'https://api.scan.pulsechain.com/api/v2/addresses/0xwallet/token-transfers?type=ERC-20&block_number=120',
    ]);

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xbridgebase',
        asset: 'USDC (from Base)',
        bridged: true,
        type: 'deposit',
      }),
      expect.objectContaining({
        hash: '0xpage1',
        asset: 'PLS',
      }),
    ]);
    expect(result.nextBlock).toBe(120);
  });

  it('adds explicit bridge metadata for known PulseChain bridge assets', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          next_page_params: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              transaction_hash: '0xliberty',
              timestamp: '2026-04-24T13:00:00.000000Z',
              block_number: 160,
              from: { hash: '0xbridge' },
              to: { hash: '0xwallet' },
              token: {
                address_hash: '0x80316335349e52643527c6986816e6c483478248',
                symbol: 'USDC',
                name: 'USDC',
                decimals: '6',
              },
              total: {
                decimals: '6',
                value: '100000000',
              },
              log_index: 1,
            },
            {
              transaction_hash: '0xofficialbase',
              timestamp: '2026-04-24T13:01:00.000000Z',
              block_number: 161,
              from: { hash: '0xbridge' },
              to: { hash: '0xwallet' },
              token: {
                address_hash: '0x41527c4d9d47ef03f00f77d794c87ba94832700b',
                symbol: 'USDC',
                name: 'USDC',
                decimals: '6',
              },
              total: {
                decimals: '6',
                value: '200000000',
              },
              log_index: 2,
            },
          ],
          next_page_params: null,
        }),
      });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xofficialbase',
        asset: 'USDC (from Base)',
        bridged: true,
        bridge: {
          originChain: 'base',
          protocol: 'official',
        },
      }),
      expect.objectContaining({
        hash: '0xliberty',
        asset: 'USDC (Liberty Bridge)',
        bridged: true,
        bridge: {
          originChain: 'ethereum',
          protocol: 'liberty',
        },
      }),
    ]);
  });

  it('marks HEX stake start transactions with staking metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xstake',
              timestamp: '2026-04-24T14:00:00.000000Z',
              block_number: 170,
              from: { hash: '0xwallet' },
              to: { hash: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39' },
              value: '0',
              fee: { value: '21000000000000' },
              status: 'ok',
              method: 'stakeStart',
            },
          ],
          next_page_params: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              transaction_hash: '0xstake',
              timestamp: '2026-04-24T14:00:00.000000Z',
              block_number: 170,
              from: { hash: '0xwallet' },
              to: { hash: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39' },
              token: {
                address_hash: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
                symbol: 'HEX',
                name: 'HEX',
                decimals: '8',
              },
              total: {
                decimals: '8',
                value: '2500000000000',
              },
              log_index: 1,
            },
          ],
          next_page_params: null,
        }),
      });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xstake',
        type: 'withdraw',
        asset: 'HEX',
        amount: 25000,
        staking: {
          protocol: 'hex',
          action: 'stakeStart',
        },
      }),
    ]);
  });

  it('normalizes Base native and token history into shared transaction output', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xbaseeth',
              timestamp: '2026-04-24T15:00:00.000000Z',
              block_number: 210,
              from: { hash: '0xexternal' },
              to: { hash: '0xwallet' },
              value: '1000000000000000000',
              gas_used: '21000',
              gas_price: '1000000000',
            },
            {
              hash: '0xliberty',
              timestamp: '2026-04-24T15:05:00.000000Z',
              block_number: 211,
              from: { hash: '0xwallet' },
              to: { hash: '0xcf3d89aedd07ee94e5c45037581744e2d9f0b9fc' },
              value: '0',
              raw_input: `0xdc655e26${'0'.repeat(64 * 11)}${'0'.repeat(63)}1${'0'.repeat(63)}6a`,
              gas_used: '42000',
              gas_price: '1000000000',
            },
          ],
          next_page_params: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              transaction_hash: '0xliberty',
              timestamp: '2026-04-24T15:05:00.000000Z',
              block_number: 211,
              from: { hash: '0xwallet' },
              to: { hash: '0xrouter' },
              token: {
                address_hash: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                symbol: 'USDC',
                decimals: '6',
              },
              total: {
                decimals: '6',
                value: '100000000',
              },
              log_index: 0,
            },
          ],
          next_page_params: null,
        }),
      });

    const result = await fetchBaseTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://base.blockscout.com/api/v2',
      marketPrices: { ethereum: 3000, 'usd-coin': 1 },
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xliberty',
        type: 'withdraw',
        chain: 'base',
        asset: 'USDC',
        amount: 100,
        libertySwap: {
          dstChainId: 6,
          orderId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
        swapLegOnly: true,
      }),
      expect.objectContaining({
        hash: '0xbaseeth',
        type: 'deposit',
        chain: 'base',
        asset: 'ETH',
        amount: 1,
        valueUsd: 3000,
      }),
    ]);
  });

  it('normalizes Ethereum native, token, and internal transfer history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          status: '1',
          result: [
            {
              hash: '0xethin',
              timeStamp: '1713960000',
              from: '0xexternal',
              to: '0xwallet',
              value: '1000000000000000000',
              gasUsed: '21000',
              gasPrice: '1000000000',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: '1',
          result: [
            {
              hash: '0xswapeth',
              timeStamp: '1713963600',
              from: '0xwallet',
              to: '0xrouter',
              value: '100000000',
              gasUsed: '60000',
              gasPrice: '1000000000',
              logIndex: '0',
              tokenSymbol: 'USDC',
              tokenDecimal: '6',
              contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: '1',
          result: [
            {
              hash: '0xswapeth',
              timeStamp: '1713963600',
              from: '0xrouter',
              to: '0xwallet',
              value: '50000000000000000',
            },
          ],
        }),
      });

    const result = await fetchEthereumTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiBase: 'https://api.etherscan.io/v2/api?chainid=1',
      apiKey: 'test-key',
      marketPrices: { ethereum: 3200, 'usd-coin': 1 },
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xswapeth',
        type: 'swap',
        chain: 'ethereum',
        asset: 'ETH',
        amount: 0.05,
        counterAsset: 'USDC',
        counterAmount: 100,
      }),
      expect.objectContaining({
        hash: '0xethin',
        type: 'deposit',
        chain: 'ethereum',
        asset: 'ETH',
        amount: 1,
        valueUsd: 3200,
      }),
    ]);
  });
});
