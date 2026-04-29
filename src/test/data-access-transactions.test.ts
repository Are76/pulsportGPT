import { describe, expect, it, vi } from 'vitest';
import { createDataAccess } from '../services/dataAccess';

describe('dataAccess.getTransactions', () => {
  it('delegates pulsechain transaction history requests through the injected dependency', async () => {
    const getPulsechainTransactions = vi.fn(async () => ({
      implemented: true,
      transactions: [],
      nextBlock: 123,
    }));
    const getEthereumTransactions = vi.fn(async () => ({
      implemented: true,
      transactions: [],
      nextBlock: 456,
    }));
    const getBaseTransactions = vi.fn(async () => ({
      implemented: true,
      transactions: [],
      nextBlock: 789,
    }));

    const dataAccess = createDataAccess({
      searchPulsechainTokens: async () => [],
      getPulsechainLPPositions: async () => [],
      getPulsechainTokenBalances: async () => [],
      getPulsechainPrices: async () => [],
      getBaseTransactions,
      getEthereumTransactions,
      getPulsechainTransactions,
    });

    await expect(dataAccess.getTransactions('0xwallet', 'pulsechain', 456)).resolves.toEqual({
      implemented: true,
      transactions: [],
      nextBlock: 123,
    });

    expect(getPulsechainTransactions).toHaveBeenCalledWith('0xwallet', 456);
    await expect(dataAccess.getTransactions('0xwallet', 'ethereum', 654)).resolves.toEqual({
      implemented: true,
      transactions: [],
      nextBlock: 456,
    });
    await expect(dataAccess.getTransactions('0xwallet', 'base', 987)).resolves.toEqual({
      implemented: true,
      transactions: [],
      nextBlock: 789,
    });

    expect(getEthereumTransactions).toHaveBeenCalledWith('0xwallet', 654);
    expect(getBaseTransactions).toHaveBeenCalledWith('0xwallet', 987);
  });
});
