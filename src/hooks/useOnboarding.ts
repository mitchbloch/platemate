"use client";

import { useState, useEffect, useCallback } from "react";

interface UseOnboardingResult {
  shouldShowTour: boolean;
  completeTour: () => Promise<void>;
  skipTour: () => Promise<void>;
  loading: boolean;
}

export function useOnboarding(): UseOnboardingResult {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const profile = await res.json();
        if (!cancelled) {
          setShouldShowTour(
            !profile.onboardingCompleted && !profile.onboardingSkipped
          );
        }
      } catch {
        // Silently fail — don't block the app for onboarding
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeTour = useCallback(async () => {
    setShouldShowTour(false);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } catch {
      // Best-effort — tour is already dismissed in the UI
    }
  }, []);

  const skipTour = useCallback(async () => {
    setShouldShowTour(false);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingSkipped: true }),
      });
    } catch {
      // Best-effort — tour is already dismissed in the UI
    }
  }, []);

  return { shouldShowTour, completeTour, skipTour, loading };
}
