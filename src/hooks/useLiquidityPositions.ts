import { useState, useCallback, useEffect, useRef } from 'react';
import { dataAccess } from '../services/dataAccess';
import type { LpPositionEnriched } from '../types';

export interface UseLiquidityPositionsResult {
  positions: LpPositionEnriched[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLiquidityPositions(
  walletAddresses: string[],
  tokenPrices: Record<string, number>,
): UseLiquidityPositionsResult {
  const [positions, setPositions] = useState<LpPositionEnriched[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const walletAddressesKey = walletAddresses.join('|');
  const tokenPricesKey = Object.entries(tokenPrices)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([symbol, price]) => `${symbol}:${price}`)
    .join('|');

  const fetchPositions = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (walletAddresses.length === 0) {
      setPositions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextPositions = await dataAccess.getLPPositions(
        walletAddresses,
        'pulsechain',
        tokenPrices,
      );

      if (requestRef.current !== requestId) {
        return;
      }

      setPositions(nextPositions);
    } catch (err) {
      if (requestRef.current !== requestId) {
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to fetch LP positions');
      setPositions([]);
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [walletAddresses, tokenPrices]);

  const refetch = useCallback(() => {
    void fetchPositions();
  }, [fetchPositions]);

  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    requestRef.current += 1;
    setLoading(false);

    if (walletAddresses.length === 0) {
      setPositions([]);
      setError(null);
    }
  }, [walletAddresses.length, walletAddressesKey, tokenPricesKey]);

  useEffect(() => {
    if (walletAddresses.length === 0) {
      return;
    }

    const id = setInterval(() => {
      refetchRef.current();
    }, 60_000);

    return () => clearInterval(id);
  }, [walletAddresses.length]);

  return { positions, loading, error, refetch };
}
