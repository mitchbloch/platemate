import Link from "next/link";

export default function SharedRecipeNotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="mb-2 font-display text-2xl font-semibold text-text">This link isn&apos;t active</h1>
      <p className="mb-6 text-text-secondary">The recipe may have been unshared, or the link was copied incorrectly.</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-warm">
        Go to Platemate
      </Link>
    </main>
  );
}
