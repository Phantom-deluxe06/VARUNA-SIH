"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

interface PollingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Polls an async fetcher every `intervalMs`. Caches the last good payload in
 * localStorage so stale data can be shown while offline / on error.
 */
export function usePolling<T>(
  key: string,
  fetcher: () => Promise<T>,
  intervalMs: number,
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    try {
      const d = await fetcher();
      if (!mounted.current) return;
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
      try {
        localStorage.setItem(`varuna-cache-${key}`, JSON.stringify({ t: Date.now(), d }));
      } catch {
        /* storage full — ignore */
      }
    } catch (e) {
      if (!mounted.current) return;
      const msg = e instanceof ApiError ? e.message : "Could not reach VARUNA servers";
      setError(msg);
      // fall back to cached data with its timestamp
      try {
        const raw = localStorage.getItem(`varuna-cache-${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { t: number; d: T };
          setData(parsed.d);
          setUpdatedAt(parsed.t);
        }
      } catch {
        /* no cache */
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    mounted.current = true;
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [run, intervalMs]);

  return { data, error, loading, updatedAt, refresh: run };
}
