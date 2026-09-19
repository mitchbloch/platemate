import Nav from "@/components/Nav";
import Link from "next/link";
import { Suspense } from "react";
import { listRecipes } from "@/lib/recipes";
import RecipeLibrary from "@/components/RecipeLibrary";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  // DAL converts rows and scopes to the active household; errors surface
  // through recipes/error.tsx
  const recipes = await listRecipes();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text">Recipes</h1>
          <Link
            href="/recipes/add"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
          >
            + Add Recipe
          </Link>
        </div>

        {recipes.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <p className="mb-2 text-text-secondary">No recipes yet.</p>
            <Link
              href="/recipes/add"
              className="text-sm font-medium text-primary hover:text-primary-dark"
            >
              Import your first recipe
            </Link>
          </div>
        ) : (
          // useSearchParams needs a Suspense boundary
          <Suspense>
            <RecipeLibrary recipes={recipes} />
          </Suspense>
        )}
      </main>
    </>
  );
}
