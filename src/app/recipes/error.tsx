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
      <div className="rounded-xl border border-danger/20 bg-danger/5 p-8 text-center">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Failed to load recipes
        </h2>
        <p className="mb-4 text-sm text-gray-600">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
