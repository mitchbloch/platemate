"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface TourStep {
  target: string | null;
  title: string;
  description: string;
  href: string | null;
}

const STEPS: TourStep[] = [
  {
    target: null,
    title: "Welcome to Platemate!",
    description: "You're all set up. Let's take a quick look at how everything works.",
    href: null,
  },
  {
    target: "[data-tour='recipes']",
    title: "Recipe Library",
    description: "Import recipes from any URL or paste text. AI extracts ingredients and nutrition automatically.",
    href: "/recipes",
  },
  {
    target: "[data-tour='plan']",
    title: "Meal Plan",
    description: "Plan your weekly meals with smart suggestions based on what you've cooked before.",
    href: "/plan",
  },
  {
    target: "[data-tour='grocery']",
    title: "Grocery List",
    description: "Auto-generated from your meal plan and grouped by store. Check items off in real-time with your household.",
    href: "/grocery",
  },
  {
    target: "[data-tour='settings']",
    title: "Settings",
    description: "Update your grocery stores, dietary preferences, and nutrition priorities here any time.",
    href: "/settings",
  },
];

interface TooltipPosition {
  top: number;
  left: number;
}

interface OnboardingTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

// Returns false during SSR and the server snapshot of hydration, true once
// rendered on the client. Lets us safely gate `createPortal(document.body)`
// without an effect. React team's recommended pattern.
const emptySubscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export default function OnboardingTour({ onComplete, onSkip }: OnboardingTourProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ top: 0, left: 0 });
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const mounted = useIsClient();
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  // Non-welcome steps are 1-indexed for the counter
  const tourStepNumber = currentStep;
  const tourStepTotal = STEPS.length - 1;

  // Navigate to the page for this step when step changes
  useEffect(() => {
    if (step.href) {
      router.push(step.href);
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Measure the target element and keep rect/tooltip position in sync with
  // viewport changes. ResizeObserver fires immediately on attachment, so
  // the initial measurement happens inside the observer callback — setState
  // stays out of the effect body itself.
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector(step.target);
    if (!el) return;

    function update() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);

      const tooltipWidth = 320;
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      const top = rect.bottom + 12;

      const padding = 16;
      if (left < padding) left = padding;
      if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - padding - tooltipWidth;
      }
      setTooltipPos({ top, left });
    }

    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.target]);

  // Apply highlight z-index to target nav element
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;

    const prevPosition = el.style.position;
    const prevZIndex = el.style.zIndex;

    el.style.position = "relative";
    el.style.zIndex = "60";

    return () => {
      el.style.position = prevPosition;
      el.style.zIndex = prevZIndex;
    };
  }, [step.target]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [isLast, onComplete]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => s - 1);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft" && currentStep > 0) handleBack();
    },
    [currentStep, onSkip, handleNext, handleBack]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted) return null;

  // Welcome step — centered modal, simple overlay
  if (!step.target) {
    return createPortal(
      <>
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={onSkip}
          aria-hidden="true"
        />
        <div
          ref={tooltipRef}
          className="fixed left-1/2 top-1/2 z-[60] w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-warm"
          role="dialog"
          aria-label="Welcome to Platemate"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl">
            🍽️
          </div>
          <h3 className="mb-2 font-display text-lg font-semibold text-text">{step.title}</h3>
          <p className="mb-6 text-sm leading-relaxed text-text-secondary">{step.description}</p>
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm font-medium text-text-muted transition-colors hover:text-text-secondary"
            >
              Skip tour
            </button>
            <button
              onClick={handleNext}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              Take the tour →
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  // Regular steps — overlay with cutout + positioned tooltip
  return createPortal(
    <>
      {/* Dark overlay with spotlight cutout around the target element */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-200"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          ...(targetRect
            ? {
                clipPath: `polygon(
                  0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
                  ${targetRect.left - 6}px ${targetRect.top - 6}px,
                  ${targetRect.left - 6}px ${targetRect.bottom + 6}px,
                  ${targetRect.right + 6}px ${targetRect.bottom + 6}px,
                  ${targetRect.right + 6}px ${targetRect.top - 6}px,
                  ${targetRect.left - 6}px ${targetRect.top - 6}px
                )`,
              }
            : {}),
        }}
        onClick={onSkip}
        aria-hidden="true"
      />

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          className="pointer-events-none fixed z-50 rounded-2xl ring-2 ring-primary ring-offset-4 ring-offset-transparent transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[60] w-80 rounded-xl border border-border bg-surface p-5 shadow-warm"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
        role="dialog"
        aria-label={`Tour step ${tourStepNumber} of ${tourStepTotal}`}
      >
        <p className="mb-2 text-xs font-medium text-text-muted">
          {tourStepNumber} of {tourStepTotal}
        </p>
        <h3 className="mb-1.5 font-display text-base font-semibold text-text">{step.title}</h3>
        <p className="mb-4 text-sm leading-relaxed text-text-secondary">{step.description}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-sm font-medium text-text-muted transition-colors hover:text-text-secondary"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-border-light"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
