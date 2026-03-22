import { INGREDIENT_TO_GROCERY_CATEGORY } from "./categoryMap";
import type {
  Ingredient,
  MealPlanRecipe,
  MergedIngredient,
  Recipe,
} from "./types";

// ── Unit Normalization ──

const UNIT_ALIASES: Record<string, string> = {
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsps: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsps: "tsp",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  cup: "cup",
  cups: "cup",
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  bunch: "bunch",
  bunches: "bunch",
  head: "head",
  heads: "head",
  piece: "piece",
  pieces: "piece",
  slice: "slice",
  slices: "slice",
  stalk: "stalk",
  stalks: "stalk",
  sprig: "sprig",
  sprigs: "sprig",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  quart: "qt",
  quarts: "qt",
  pint: "pt",
  pints: "pt",
  gallon: "gal",
  gallons: "gal",
  liter: "L",
  liters: "L",
  milliliter: "mL",
  milliliters: "mL",
  ml: "mL",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
};

export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const lower = unit.toLowerCase().trim();
  if (!lower) return null;
  return UNIT_ALIASES[lower] ?? lower;
}

// ── Name Normalization ──

// Common trailing plurals that are safe to strip
const PLURAL_EXCEPTIONS = new Set([
  "hummus",
  "couscous",
  "asparagus",
  "molasses",
  "swiss",
  "lemongrass",
]);

export function normalizeIngredientName(name: string): string {
  let normalized = name.toLowerCase().trim().replace(/\s+/g, " ");

  // Strip trailing 's' for simple plurals, but not words ending in 'ss', 'us', etc.
  if (
    normalized.endsWith("s") &&
    !normalized.endsWith("ss") &&
    !PLURAL_EXCEPTIONS.has(normalized) &&
    normalized.length > 3
  ) {
    // Handle 'ies' → 'y' (e.g., 'berries' → 'berry')
    if (normalized.endsWith("ies")) {
      normalized = normalized.slice(0, -3) + "y";
    }
    // Handle 'oes' → 'o' (e.g., 'tomatoes' → 'tomato', 'potatoes' → 'potato')
    else if (normalized.endsWith("oes")) {
      normalized = normalized.slice(0, -2);
    }
    // Handle 'ves' → 'f' (e.g., 'halves' → 'half')
    else if (normalized.endsWith("ves")) {
      normalized = normalized.slice(0, -3) + "f";
    }
    // Simple 's' removal
    else {
      normalized = normalized.slice(0, -1);
    }
  }

  return normalized;
}

// ── Merging Logic ──

export function canMerge(
  a: { normalizedName: string; unit: string | null },
  b: { normalizedName: string; unit: string | null },
): boolean {
  if (a.normalizedName !== b.normalizedName) return false;
  // Both null → mergeable (unitless items like "salt")
  if (a.unit === null && b.unit === null) return true;
  // Same unit → mergeable
  return a.unit === b.unit;
}

export function mergeQuantities(
  items: { quantity: number | null; unit: string | null }[],
): { quantity: number | null; unit: string | null } {
  if (items.length === 0) return { quantity: null, unit: null };

  const unit = items[0].unit;

  // If any quantity is null, result is null (can't sum unknown amounts)
  if (items.some((i) => i.quantity === null)) {
    return { quantity: null, unit };
  }

  const total = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
  // Round to avoid floating point weirdness (e.g., 0.1 + 0.2)
  return { quantity: Math.round(total * 100) / 100, unit };
}

// ── Main Deduplication ──

interface MealWithRecipe {
  meal: MealPlanRecipe;
  recipe: Recipe;
}

interface AccumulatorEntry {
  normalizedName: string;
  displayName: string; // keep the first occurrence's casing
  items: { quantity: number | null; unit: string | null }[];
  category: Ingredient["category"];
  recipeIds: Set<string>;
}

export function deduplicateIngredients(
  meals: MealWithRecipe[],
): MergedIngredient[] {
  // Key: `${normalizedName}|${normalizedUnit}` to handle same ingredient with different units separately
  const accumulator = new Map<string, AccumulatorEntry>();

  for (const { meal, recipe } of meals) {
    const servingMultiplier =
      (meal.servingsOverride ?? recipe.servings) / recipe.servings;

    for (const ingredient of recipe.ingredients) {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const normalizedUnit = normalizeUnit(ingredient.unit);
      const adjustedQuantity =
        ingredient.quantity !== null
          ? Math.round(ingredient.quantity * servingMultiplier * 100) / 100
          : null;

      const key = `${normalizedName}|${normalizedUnit ?? ""}`;

      const existing = accumulator.get(key);
      if (existing) {
        existing.items.push({ quantity: adjustedQuantity, unit: normalizedUnit });
        existing.recipeIds.add(recipe.id);
      } else {
        accumulator.set(key, {
          normalizedName,
          displayName: toDisplayName(ingredient.name),
          items: [{ quantity: adjustedQuantity, unit: normalizedUnit }],
          category: ingredient.category,
          recipeIds: new Set([recipe.id]),
        });
      }
    }
  }

  // Merge and sort
  const merged: MergedIngredient[] = [];
  for (const entry of accumulator.values()) {
    const { quantity, unit } = mergeQuantities(entry.items);
    merged.push({
      name: entry.normalizedName,
      displayName: entry.displayName,
      quantity,
      unit,
      category: INGREDIENT_TO_GROCERY_CATEGORY[entry.category],
      store: "trader-joes", // default, can be overridden later via ingredients catalog
      recipeIds: Array.from(entry.recipeIds),
    });
  }

  // Sort by category order, then alphabetically within category
  const categoryOrder = ["protein", "produce", "dairy", "snacks", "other"];
  merged.sort((a, b) => {
    const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.displayName.localeCompare(b.displayName);
  });

  return merged;
}

// ── Helpers ──

function toDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
