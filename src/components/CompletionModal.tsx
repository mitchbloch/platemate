"use client";

import { useEffect, useCallback } from "react";

interface CompletionModalProps {
  onGoBack: () => void;
  onComplete: () => void;
}

export default function CompletionModal({
  onGoBack,
  onComplete,
}: CompletionModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onGoBack();
    },
    [onGoBack],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-warm-lg">
        <h2 className="font-display text-lg font-semibold text-text">
          All done!
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          You&apos;ve checked off everything on your list. Nice work!
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onGoBack}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-border-light"
          >
            Go Back
          </button>
          <button
            onClick={onComplete}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
          >
            Complete &amp; Next Week
          </button>
        </div>
      </div>
    </div>
  );
}
