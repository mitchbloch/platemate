import Nav from "@/components/Nav";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RecipeCard from "@/components/RecipeCard";
import type { Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
          <Link
            href="/recipes/add"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            + Add Recipe
          </Link>
        </div>

        {error && (
          <p className="text-sm text-danger">
            Failed to load recipes: {error.message}
          </p>
        )}

        {recipes && recipes.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="mb-2 text-gray-600">No recipes yet.</p>
            <Link
              href="/recipes/add"
              className="text-sm font-medium text-primary hover:text-primary-dark"
            >
              Import your first recipe
            </Link>
          </div>
        )}

        {recipes && recipes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe as unknown as Recipe} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
