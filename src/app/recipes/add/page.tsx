"use client";

import Link from "next/link";
import Nav from "@/components/Nav";
import RecipeForm from "@/components/RecipeForm";

export default function AddRecipePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 font-display text-2xl font-semibold tracking-tight text-text">
          Add Recipe
        </h1>
        <p className="mb-6 text-sm text-text-muted">
          Import from a link or pasted text, or{" "}
          <Link href="/recipes/generate" className="font-medium text-primary hover:text-primary-dark">
            generate a recipe with AI &rarr;
          </Link>
        </p>
        <RecipeForm />
      </main>
    </>
  );
}
