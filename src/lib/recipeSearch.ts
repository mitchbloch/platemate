import type { Recipe } from "./types";
import { CUISINE_LABELS, MEAL_TYPE_LABELS } from "./types";

/** Lowercase, strip diacritics, collapse whitespace. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The text a recipe can be found by: title, cuisine, meal type, tags, ingredient names. */
export function recipeSearchText(recipe: Recipe): string {
  return normalizeSearchText(
    [
      recipe.title,
      CUISINE_LABELS[recipe.cuisine] ?? recipe.cuisine,
      MEAL_TYPE_LABELS[recipe.mealType] ?? recipe.mealType,
      ...recipe.tags,
      ...recipe.ingredients.map((i) => i.name),
    ].join(" | "),
  );
}

/**
 * Every whitespace-separated token in the query must appear somewhere in
 * the recipe's searchable text (AND semantics, substring match), so
 * "chicken thai" finds a Thai chicken curry regardless of word order.
 * An empty query matches everything.
 */
export function matchesRecipeQuery(recipe: Recipe, query: string): boolean {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = recipeSearchText(recipe);
  return tokens.every((token) => haystack.includes(token));
}
