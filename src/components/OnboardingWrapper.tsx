"use client";

import { useOnboarding } from "@/hooks/useOnboarding";
import OnboardingTour from "@/components/OnboardingTour";

export default function OnboardingWrapper() {
  const { shouldShowTour, completeTour, skipTour, loading } = useOnboarding();

  if (loading || !shouldShowTour) return null;

  return <OnboardingTour onComplete={completeTour} onSkip={skipTour} />;
}
