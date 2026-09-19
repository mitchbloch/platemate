"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** How long the app must be hidden before a resume triggers a refresh. */
export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000;

/**
 * iOS suspends an installed PWA in the background and drops its in-flight
 * fetches. A navigation whose request died never resolves, which is what
 * makes the app feel frozen until it's force-quit. When the app becomes
 * visible again after a long enough absence, refresh the auth session (so
 * the next request carries a live token) and re-render the current route.
 */
export function useResumeRefresh(thresholdMs: number = RESUME_REFRESH_AFTER_MS) {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const since = hiddenAt.current;
      hiddenAt.current = null;
      if (since === null || Date.now() - since < thresholdMs) return;

      // getSession() refreshes an expired token before we refetch
      createClient()
        .auth.getSession()
        .catch(() => undefined)
        .finally(() => router.refresh());
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router, thresholdMs]);
}
