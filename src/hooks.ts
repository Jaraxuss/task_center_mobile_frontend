import { DependencyList, useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refresh: () => Promise<T | undefined>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: DependencyList = [], enabled = true): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const memoizedLoader = useCallback(loader, deps);

  const refresh = useCallback(async () => {
    if (!enabled) return undefined;
    setLoading(true);
    setError(null);
    try {
      const value = await memoizedLoader();
      setData(value);
      setLoaded(true);
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, memoizedLoader]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return { data, loading, error, loaded, refresh, setData };
}
