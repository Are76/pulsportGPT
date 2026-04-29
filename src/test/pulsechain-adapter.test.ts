import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKENS } from '../constants';
import { getPulsechainTokenBalances } from '../services/adapters/pulsechainAdapter';

describe('pulsechainAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to the secondary RPC when the primary returns a non-ok HTTP status', async () => {
    const body = Array.from({ length: TOKENS.pulsechain.length }, (_, index) => ({
      id: index + 1,
      result: index === 0 ? '0xde0b6b3a7640000' : '0x0',
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => body,
      });

    vi.stubGlobal('fetch', fetchMock);

    const balances = await getPulsechainTokenBalances('0x00000000000000000000000000000000000000aa');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(balances).toEqual([
      expect.objectContaining({
        symbol: 'PLS',
        balance: 1,
        chain: 'pulsechain',
      }),
    ]);
  });
});
