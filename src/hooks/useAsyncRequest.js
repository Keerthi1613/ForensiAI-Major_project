import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small async wrapper for consistent loading + error handling.
 * `requestFn` should return a Promise.
 */
export function useAsyncRequest(requestFn, deps = [], options = {}) {
  const { immediate = true } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await requestFn();
      if (mountedRef.current) setData(result);
    } catch (err) {
      if (mountedRef.current) setError(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!immediate) return;
    run();
  }, [run, immediate]);

  return { data, loading, error, refetch: run };
}

