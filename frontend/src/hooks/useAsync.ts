import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === requestId.current) setData(result);
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
