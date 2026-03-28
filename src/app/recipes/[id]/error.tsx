"use client";

export default function RecipeDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-center">
      <h2 className="mb-2 text-lg font-semibold text-text">
        Failed to load recipe
      </h2>
      <p className="mb-4 text-sm text-text-secondary">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-white shadow-warm transition-colors hover:bg-primary-dark"
      >
        Try again
      </button>
    </div>
  );
}
