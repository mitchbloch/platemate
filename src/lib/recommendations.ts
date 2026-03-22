import type { Recipe, CuisineType } from "./types";

export interface RecipeSuggestion {
  recipe: Recipe;
  reason: string;
  lastCooked: string | null;
  daysSinceCooked: number | null;
}

/**
 * Score and rank recipes for the weekly planner.
 *
 * Logic:
 * 1. Filter out recipes already in the current plan.
 * 2. Score by recency: never-cooked highest, then longest-since-cooked.
 * 3. Apply cuisine variety penalty: if the current plan already has cuisine X,
 *    penalize other cuisine X recipes to encourage variety.
 * 4. Attach a human-readable reason to each suggestion.
 */
export function suggestRecipes(
  allRecipes: Recipe[],
  lastCookedDates: Record<string, string>,
  currentPlanRecipeIds: Set<string>,
  currentPlanCuisines: CuisineType[] = [],
): RecipeSuggestion[] {
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;

  // Count cuisines already in the plan
  const cuisineCounts = new Map<CuisineType, number>();
  for (const cuisine of currentPlanCuisines) {
    cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) ?? 0) + 1);
  }

  const candidates = allRecipes
    .filter((r) => !currentPlanRecipeIds.has(r.id))
    .map((recipe) => {
      const lastCooked = lastCookedDates[recipe.id] ?? null;
      const daysSinceCooked = lastCooked
        ? Math.floor((now - new Date(lastCooked).getTime()) / msPerDay)
        : null;

      // Base score: never-cooked = 1000, otherwise days since cooked
      let score = daysSinceCooked === null ? 1000 : daysSinceCooked;

      // Cuisine variety penalty: -200 per existing meal of same cuisine in plan
      const sameCuisineCount = cuisineCounts.get(recipe.cuisine) ?? 0;
      score -= sameCuisineCount * 200;

      // Build reason
      let reason: string;
      if (daysSinceCooked === null) {
        reason = "Never cooked — give it a try!";
      } else if (sameCuisineCount > 0 && score < daysSinceCooked) {
        reason = `Try something different — you already have ${recipe.cuisine} this week`;
      } else if (daysSinceCooked >= 21) {
        const weeks = Math.floor(daysSinceCooked / 7);
        reason = `Not cooked in ${weeks} weeks`;
      } else if (daysSinceCooked >= 7) {
        const weeks = Math.floor(daysSinceCooked / 7);
        reason = `Last cooked ${weeks} week${weeks === 1 ? "" : "s"} ago`;
      } else {
        reason = `Cooked ${daysSinceCooked} day${daysSinceCooked === 1 ? "" : "s"} ago`;
      }

      return { recipe, reason, lastCooked, daysSinceCooked, score };
    });

  // Sort by score descending (higher = more recommended)
  candidates.sort((a, b) => b.score - a.score);

  return candidates.map((c) => ({
    recipe: c.recipe,
    reason: c.reason,
    lastCooked: c.lastCooked,
    daysSinceCooked: c.daysSinceCooked,
  }));
}
