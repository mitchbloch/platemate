import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { CUISINE_LABELS } from "@/lib/types";
import NutritionBadge from "./NutritionBadge";

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const totalTime = recipe.totalTimeMinutes ?? 0;

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group rounded-xl border border-gray-200 p-5 transition-colors hover:border-primary hover:bg-primary/5"
    >
      <h3 className="mb-1 font-semibold text-gray-900 group-hover:text-primary">
        {recipe.title}
      </h3>

      <div className="mb-3 flex flex-wrap gap-1.5 text-xs text-gray-500">
        {recipe.cuisine && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5">
            {CUISINE_LABELS[recipe.cuisine]}
          </span>
        )}
        {recipe.isSlowCooker && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
            Slow Cooker
          </span>
        )}
        {totalTime > 0 && (
          <span>{totalTime} min</span>
        )}
        <span>{recipe.servings} servings</span>
      </div>

      {recipe.nutrition && (
        <NutritionBadge nutrition={recipe.nutrition} compact />
      )}
    </Link>
  );
}
