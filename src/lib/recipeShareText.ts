import type { SharedRecipe } from "./types";
import { CUISINE_LABELS, MEAL_TYPE_LABELS } from "./types";
import { ingredientRaw } from "./recipeValidation";

/** Plain-text version of a recipe for the share sheet / clipboard. */
export function formatRecipeAsText(recipe: SharedRecipe["recipe"], shareUrl?: string): string {
  const meta = [
    CUISINE_LABELS[recipe.cuisine] ?? recipe.cuisine,
    MEAL_TYPE_LABELS[recipe.mealType] ?? recipe.mealType,
    `${recipe.servings} servings`,
    recipe.totalTimeMinutes ? `${recipe.totalTimeMinutes} min` : null,
    recipe.isSlowCooker ? "Slow cooker" : null,
  ].filter(Boolean);

  const lines: string[] = [recipe.title, meta.join(" · ")];
  if (recipe.description) lines.push("", recipe.description);

  lines.push("", "Ingredients");
  for (const ing of recipe.ingredients) lines.push(`- ${ing.raw?.trim() || ingredientRaw(ing)}`);

  lines.push("", "Instructions");
  recipe.instructions.forEach((step, i) => lines.push(`${i + 1}. ${step}`));

  if (recipe.sourceUrl) lines.push("", `Source: ${recipe.sourceUrl}`);
  if (shareUrl) lines.push("", `Shared from Platemate: ${shareUrl}`);
  return lines.join("\n");
}
