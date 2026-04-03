"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

interface TourStep {
  target: string;
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    target: "[data-tour='recipes']",
    title: "Recipe Library",
    description:
      "Import recipes from any URL or paste text. AI extracts ingredients and nutrition.",
  },
  {
    target: "[data-tour='plan']",
    title: "Meal Plan",
    description:
      "Plan your weekly meals with smart suggestions based on what you've cooked before.",
  },
  {
    target: "[data-tour='grocery']",
    title: "Grocery List",
    description:
      "Auto-generated and grouped by store. Check items off in real-time with your household.",
  },
  {
    target: "[data-tour='settings']",
    title: "Settings",
    description:
      "Configure your household's stores, dietary preferences, and nutrition tracking.",
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

export default function OnboardingTour({
  onComplete,
  onSkip,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({
    top: 0,
    left: 0,
  });
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const positionTooltip = useCallback(() => {
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    // Position tooltip below the target element, centered horizontally
    const tooltipWidth = 320;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    const top = rect.bottom + 12;

    // Keep tooltip within viewport
    const padding = 16;
    if (left < padding) left = padding;
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - tooltipWidth;
    }

    setTooltipPos({ top, left });
  }, [step.target]);

  // Set mounted flag for portal rendering
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Position on mount and step change
  useEffect(() => {
    positionTooltip();

    // Reposition on scroll/resize
    window.addEventListener("resize", positionTooltip);
    window.addEventListener("scroll", positionTooltip, true);
    return () => {
      window.removeEventListener("resize", positionTooltip);
      window.removeEventListener("scroll", positionTooltip, true);
    };
  }, [positionTooltip]);

  // Apply highlight z-index to target element
  useEffect(() => {
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;

    const prevPosition = el.style.position;
    const prevZIndex = el.style.zIndex;
    const prevRelative = el.style.position;

    el.style.position = "relative";
    el.style.zIndex = "60";

    return () => {
      el.style.position = prevPosition || prevRelative;
      el.style.zIndex = prevZIndex;
    };
  }, [step.target]);

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft" && currentStep > 0) {
        setCurrentStep((s) => s - 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep, isLast, onSkip]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Dark overlay with cutout */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-200"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          // Create a cutout using clip-path if we have a target rect
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

      {/* Highlight border around target */}
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
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
        }}
        role="dialog"
        aria-label={`Tour step ${currentStep + 1} of ${STEPS.length}`}
      >
        {/* Step counter */}
        <p className="mb-2 text-xs font-medium text-text-muted">
          {currentStep + 1} of {STEPS.length}
        </p>

        {/* Title */}
        <h3 className="mb-1.5 font-display text-base font-semibold text-text">
          {step.title}
        </h3>

        {/* Description */}
        <p className="mb-4 text-sm leading-relaxed text-text-secondary">
          {step.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-sm font-medium text-text-muted transition-colors hover:text-text-secondary"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
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
