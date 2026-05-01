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
        id: '0xswap-native-withdraw-interaction-0',
        hash: '0xswap',
        type: 'interaction',
        chain: 'pulsechain',
        asset: 'PLS',
        amount: 0,
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
        type: 'deposit',
        asset: 'PLS',
        amount: 1,
      }),
      expect.objectContaining({
        hash: '0xpage2',
        type: 'interaction',
        asset: 'PLS',
        amount: 0,
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

  it('keeps native PulseChain history when token transfer pagination fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xnativeonly',
              timestamp: '2026-04-24T10:00:00.000000Z',
              block_number: 120,
              from: { hash: '0xexternal' },
              to: { hash: '0xwallet' },
              value: '1000000000000000000',
              fee: { value: '21000000000000' },
              status: 'ok',
            },
          ],
          next_page_params: null,
        }),
      })
      .mockResolvedValue({
        ok: false,
        status: 502,
      });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xnativeonly',
        asset: 'PLS',
        type: 'deposit',
        chain: 'pulsechain',
      }),
    ]);
  });

  it('keeps successful PulseChain token transfer pages when a later page returns 502', async () => {
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
            items: [],
            next_page_params: null,
          }),
        };
      }

      if (url.endsWith('/addresses/0xwallet/token-transfers?type=ERC-20')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                transaction_hash: '0xfirstpage',
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
                  value: '100000000',
                },
                log_index: 0,
              },
            ],
            next_page_params: {
              block_number: 120,
              index: 194,
            },
          }),
        };
      }

      if (url.includes('/addresses/0xwallet/token-transfers?type=ERC-20&block_number=120&index=194')) {
        return {
          ok: false,
          status: 502,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://api.scan.pulsechain.com/api/v2',
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xfirstpage',
        asset: 'HEX',
        type: 'deposit',
        chain: 'pulsechain',
      }),
    ]);
  });

  it('normalizes live PulseChain token transfer field names from tx_hash and token.address', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xlivepulse',
              timestamp: '2026-04-24T11:00:00.000000Z',
              block_number: 121,
              from: { hash: '0xwallet' },
              to: { hash: '0xrouter' },
              value: '500000000000000000',
              fee: { value: '42000000000000' },
              status: 'ok',
              method: 'multicall',
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
              tx_hash: '0xlivepulse',
              timestamp: '2026-04-24T11:00:00.000000Z',
              block_number: 121,
              from: { hash: '0xwallet' },
              to: { hash: '0xrouter' },
              token: {
                address: '0x41527c4d9d47ef03f00f77d794c87ba94832700b',
                symbol: 'USDC',
                name: 'USDC',
                decimals: '6',
              },
              total: {
                decimals: '6',
                value: '12713498',
              },
              log_index: 31,
              method: 'multicall',
            },
            {
              tx_hash: '0xlivepulse',
              timestamp: '2026-04-24T11:00:00.000000Z',
              block_number: 121,
              from: { hash: '0x7f681a5ad615238357ba148c281e2eaefd2de55a' },
              to: { hash: '0xwallet' },
              token: {
                address: '0xf6f8db0aba00007681f8faf16a0fda1c9b030b11',
                symbol: 'PRVX',
                name: 'ProveX',
                decimals: '18',
              },
              total: {
                decimals: '18',
                value: '170921152373242158912538',
              },
              log_index: 32,
              method: 'multicall',
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
        hash: '0xlivepulse',
        type: 'swap',
        asset: 'PRVX',
        counterAsset: 'USDC (from Base)',
        bridged: true,
        chain: 'pulsechain',
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
      expect.objectContaining({
        hash: '0xstake',
        type: 'interaction',
        asset: 'PLS',
        amount: 0,
      }),
    ]);
  });

  it('uses compat internal transfers to reconstruct PulseChain swaps that settle back in PLS', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.includes('action=txlist&')) {
        return {
          json: async () => ({
            status: '1',
            result: [
              {
                hash: '0xmultisplit',
                timeStamp: '1777289505',
                from: '0xwallet',
                to: '0xrouter',
                value: '0',
                gasUsed: '406313',
                gasPrice: '804031584293433',
                txreceipt_status: '1',
                isError: '0',
                functionName: 'multicall(uint256,bytes[])',
                input: '0xac9650d8',
                blockNumber: '26391910',
              },
            ],
          }),
        };
      }

      if (url.includes('action=tokentx&')) {
        return {
          json: async () => ({
            status: '1',
            result: [
              {
                hash: '0xmultisplit',
                timeStamp: '1777289505',
                from: '0xwallet',
                to: '0xpair1',
                value: '12000000000000000000000',
                tokenSymbol: 'MOST',
                tokenName: 'MostWanted',
                tokenDecimal: '18',
                contractAddress: '0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC',
                blockNumber: '26391910',
                logIndex: '2013',
              },
              {
                hash: '0xmultisplit',
                timeStamp: '1777289505',
                from: '0xwallet',
                to: '0xpair2',
                value: '3000000000000000000000',
                tokenSymbol: 'MOST',
                tokenName: 'MostWanted',
                tokenDecimal: '18',
                contractAddress: '0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC',
                blockNumber: '26391910',
                logIndex: '2017',
              },
            ],
          }),
        };
      }

      if (url.includes('action=txlistinternal&')) {
        return {
          json: async () => ({
            status: '1',
            result: [
              {
                hash: '0xmultisplit',
                timeStamp: '1777289505',
                from: '0xrouter',
                to: '0xwallet',
                value: '8430922231762240000000000',
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchPulsechainTransactions('0xwallet', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.transactions).toEqual([
      expect.objectContaining({
        hash: '0xmultisplit',
        type: 'swap',
        asset: 'PLS',
        amount: 8430922.23176224,
        counterAsset: 'MOST',
        counterAmount: 15000,
      }),
      expect.objectContaining({
        hash: '0xmultisplit',
        type: 'interaction',
        asset: 'PLS',
        amount: 0,
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
        hash: '0xliberty',
        type: 'interaction',
        chain: 'base',
        asset: 'ETH',
        amount: 0,
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

  // ── Regression: Bug 1 – PulseChain timeout (request hangs indefinitely) ────────
  it('rejects with an error when the Blockscout request times out instead of hanging', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      // Simulate a timeout abort from AbortSignal
      const signal = (init as RequestInit & { signal?: AbortSignal })?.signal;
      if (signal) {
        await new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
          // dispatch abort immediately to simulate timeout
          (signal as any).dispatchEvent(new Event('abort'));
        });
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    await expect(
      fetchPulsechainTransactions('0x75f808367720951e789d47e9e9db51148d9aa765', {
        fetchImpl: fetchMock as unknown as typeof fetch,
        baseUrl: 'https://api.scan.pulsechain.com/api/v2',
      }),
    ).rejects.toThrow();
  });

  // ── Regression: Bug 2 – Base history truncated at first empty page ────────────
  it('continues pagination through empty Blockscout pages to reach older history', async () => {
    // Simulates what Base Blockscout returns for address 0x75F808367720951e…
    // Page 1: 1 recent tx (block 22_000_000)
    // Page 2: 0 items but next_page_params points to an older cursor – this is
    //   the page that used to cause early exit, hiding pre-July-2025 history.
    // Page 3: 1 old tx (block 18_000_000, i.e. early 2024)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        // native txns page 1
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xrecent',
              timestamp: '2025-11-01T10:00:00.000000Z',
              block_number: 22_000_000,
              from: { hash: '0xexternal' },
              to: { hash: '0x75f808367720951e789d47e9e9db51148d9aa765' },
              value: '1000000000000000000',
              gas_used: '21000',
              gas_price: '1000000000',
            },
          ],
          next_page_params: { block_number: 19_000_000, index: 5 },
        }),
      })
      .mockResolvedValueOnce({
        // token transfers page 1 – empty but cursor present (sparse period)
        ok: true,
        json: async () => ({
          items: [],
          next_page_params: { block_number: 18_500_000, index: 0 },
        }),
      })
      .mockResolvedValueOnce({
        // native txns page 2 – old tx pre-dating the sparse period
        ok: true,
        json: async () => ({
          items: [
            {
              hash: '0xold',
              timestamp: '2024-02-15T08:00:00.000000Z',
              block_number: 18_000_000,
              from: { hash: '0x75f808367720951e789d47e9e9db51148d9aa765' },
              to: { hash: '0xexternal' },
              value: '500000000000000000',
              gas_used: '21000',
              gas_price: '1000000000',
            },
          ],
          next_page_params: null,
        }),
      })
      .mockResolvedValueOnce({
        // token transfers page 2 – nothing left
        ok: true,
        json: async () => ({
          items: [],
          next_page_params: null,
        }),
      });

    const result = await fetchBaseTransactions('0x75F808367720951e789d47E9E9dB51148D9aa765', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://base.blockscout.com/api/v2',
      marketPrices: { ethereum: 3000 },
    });

    // Both the recent AND the old tx must be present – not just the recent one
    const hashes = result.transactions.map(tx => tx.hash);
    expect(hashes).toContain('0xrecent');
    expect(hashes).toContain('0xold');
    expect(result.transactions.length).toBeGreaterThanOrEqual(2);
  });
});
