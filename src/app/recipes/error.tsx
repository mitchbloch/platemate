"use client";

export default function RecipesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-2xl border border-danger-light bg-danger-light/50 p-8 text-center">
        <h2 className="mb-2 text-lg font-semibold text-text">
          Failed to load recipes
        </h2>
        <p className="mb-4 text-sm text-text-secondary">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white shadow-warm transition-colors hover:bg-primary-dark"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
