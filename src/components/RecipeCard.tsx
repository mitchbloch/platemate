import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { CUISINE_LABELS } from "@/lib/types";
import NutritionBadge from "./NutritionBadge";

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const totalTime = recipe.totalTimeMinutes ?? 0;

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="card-hover group rounded-2xl border border-border bg-surface p-5 shadow-warm"
    >
      <h3 className="mb-1 font-display font-semibold text-text group-hover:text-primary transition-colors">
        {recipe.title}
      </h3>

      <div className="mb-3 flex flex-wrap gap-1.5 text-xs text-text-muted">
        {recipe.cuisine && (
          <span className="rounded-md bg-accent-light px-1.5 py-0.5 text-accent">
            {CUISINE_LABELS[recipe.cuisine]}
          </span>
        )}
        {recipe.isSlowCooker && (
          <span className="rounded-md bg-gold-light px-1.5 py-0.5 text-gold">
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
