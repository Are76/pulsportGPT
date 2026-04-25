import { useEffect, useRef, useState } from 'react';
import type { PulsechainTokenSearchResult } from '../services/adapters/pulsechainAdapter';
import { createScopedTokenSearchDataAccess } from '../services/dataAccess';

export type TokenSearchResult = PulsechainTokenSearchResult;

export interface UseTokenSearchResult {
  data: TokenSearchResult[];
  isLoading: boolean;
  isError: boolean;
  noResults: boolean;
}

export function useTokenSearch(searchTerm: string): UseTokenSearchResult {
  const [data, setData] = useState<TokenSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const scopedDataAccessRef = useRef(createScopedTokenSearchDataAccess());

  useEffect(() => {
    const trimmed = searchTerm.trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (trimmed.length < 2) {
      requestRef.current += 1;
      scopedDataAccessRef.current.cancel();
      setData([]);
      setIsLoading(false);
      setIsError(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      setIsLoading(true);
      setIsError(false);

      void scopedDataAccessRef.current.dataAccess
        .searchTokens(trimmed, 'pulsechain')
        .then(results => {
          if (requestRef.current !== requestId) {
            return;
          }

          setData(results);
        })
        .catch(() => {
          if (requestRef.current !== requestId) {
            return;
          }

          setData([]);
          setIsError(true);
        })
        .finally(() => {
          if (requestRef.current !== requestId) {
            return;
          }

          setIsLoading(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      requestRef.current += 1;
      scopedDataAccessRef.current.cancel();
    };
  }, [searchTerm]);

  const noResults = !isLoading && !isError && data.length === 0 && searchTerm.trim().length >= 2;

  return { data, isLoading, isError, noResults };
}
