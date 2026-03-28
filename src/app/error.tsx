"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h2 className="mb-4 font-display text-2xl font-semibold text-text">
          Something went wrong
        </h2>
        <p className="mb-6 text-text-secondary">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-6 py-2 text-white shadow-warm transition-colors hover:bg-primary-dark"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
