import Nav from "@/components/Nav";
import NutritionBadge from "@/components/NutritionBadge";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Recipe, Ingredient } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const recipe = data as unknown as Recipe;

  const totalTime =
    (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/recipes"
          className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to recipes
        </Link>

        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="mb-3 text-gray-600">{recipe.description}</p>
          )}
          <div className="flex flex-wrap gap-2 text-sm text-gray-500">
            {recipe.sourceName && <span>{recipe.sourceName}</span>}
            {recipe.cuisine && (
              <span className="rounded bg-gray-100 px-2 py-0.5">
                {recipe.cuisine}
              </span>
            )}
            {recipe.isSlowCooker && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                Slow Cooker
              </span>
            )}
            {totalTime > 0 && <span>{totalTime} min</span>}
            <span>{recipe.servings} servings</span>
          </div>
        </div>

        {recipe.nutrition && (
          <div className="mb-8">
            <NutritionBadge nutrition={recipe.nutrition} />
          </div>
        )}

        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Ingredients
          </h2>
          <ul className="space-y-1.5">
            {recipe.ingredients.map((ing: Ingredient, i: number) => (
              <li key={i} className="text-gray-700">
                <span className="font-medium">
                  {ing.quantity && `${ing.quantity} `}
                  {ing.unit && `${ing.unit} `}
                </span>
                {ing.name}
                {ing.preparation && (
                  <span className="text-gray-500">, {ing.preparation}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Instructions
          </h2>
          <ol className="list-decimal space-y-3 pl-5">
            {recipe.instructions.map((step: string, i: number) => (
              <li key={i} className="text-gray-700">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {recipe.sourceUrl && (
          <div className="border-t border-gray-200 pt-4">
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:text-primary-dark"
            >
              View original recipe &rarr;
            </a>
          </div>
        )}
      </main>
    </>
  );
}
