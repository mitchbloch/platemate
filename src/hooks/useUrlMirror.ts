"use client";

import { useEffect, useRef } from "react";

const DEFAULT_DEBOUNCE_MS = 250;

/** Current value of a query parameter, read from the live URL. */
export function readUrlParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

/**
 * Mirror a piece of client state into the URL's query string so that
 * back-navigation restores it. Uses the native history API: no router
 * navigation, no server refetch, no echo of stale values into the input.
 * Empty values remove their parameter; other parameters are left alone.
 */
export function useUrlMirror(params: Record<string, string>, debounceMs = DEFAULT_DEBOUNCE_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialized = JSON.stringify(params);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(params)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", url);
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // params is compared by value, not identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, debounceMs]);
}
