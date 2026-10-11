/**
 * AL-BASMI ORTH — REACT ASYNCHRONOUS STORAGE HOOKS (DECISION B APPROVED)
 * Status: STAGE 1 SCOPE
 * Purpose: Provides type-safe React 19 asynchronous queries and mutations against ISqliteStorageAdapter.
 */

import React from 'react';
import { ISqliteStorageAdapter } from '../types/storageAdapter.ts';

export interface AsyncQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useClinicalQuery<T>(
  adapter: ISqliteStorageAdapter | null,
  queryFn: (adapter: ISqliteStorageAdapter) => Promise<T>,
  deps: React.DependencyList = []
): AsyncQueryResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<Error | null>(null);

  const executeQuery = React.useCallback(async () => {
    if (!adapter || !adapter.isConnected) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await queryFn(adapter);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, ...deps]);

  React.useEffect(() => {
    executeQuery();
  }, [executeQuery]);

  return {
    data,
    isLoading,
    error,
    refetch: executeQuery,
  };
}

export function useClinicalMutation<TInput, TOutput>(
  adapter: ISqliteStorageAdapter | null,
  mutationFn: (adapter: ISqliteStorageAdapter, input: TInput) => Promise<TOutput>
): {
  mutate: (input: TInput) => Promise<TOutput>;
  isMutating: boolean;
  error: Error | null;
} {
  const [isMutating, setIsMutating] = React.useState<boolean>(false);
  const [error, setError] = React.useState<Error | null>(null);

  const mutate = React.useCallback(
    async (input: TInput): Promise<TOutput> => {
      if (!adapter || !adapter.isConnected) {
        throw new Error('Database adapter is not connected.');
      }
      setIsMutating(true);
      setError(null);
      try {
        const out = await mutationFn(adapter, input);
        return out;
      } catch (err: unknown) {
        const typedErr = err instanceof Error ? err : new Error(String(err));
        setError(typedErr);
        throw typedErr;
      } finally {
        setIsMutating(false);
      }
    },
    [adapter, mutationFn]
  );

  return {
    mutate,
    isMutating,
    error,
  };
}
