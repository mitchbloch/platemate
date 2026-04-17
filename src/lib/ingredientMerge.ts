import { INGREDIENT_TO_GROCERY_CATEGORY, GROCERY_CATEGORY_ORDER } from "./categoryMap";
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
  let normalized = name.toLowerCase().trim();

  // Strip parentheticals: "tomatoes (Roma)" → "tomatoes"
  normalized = normalized.replace(/\s*\([^)]*\)/g, "");

  // Strip trailing commas and whitespace
  normalized = normalized.replace(/[,\s]+$/, "");

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, " ");

  // Normalize hyphens to spaces, then collapse again
  normalized = normalized.replace(/-/g, " ").replace(/\s+/g, " ");

  // Normalize compound word variants: "non fat" → "nonfat", "low fat" → "lowfat", etc.
  const COMPOUND_WORDS: Record<string, string> = {
    "non fat": "nonfat",
    "low fat": "lowfat",
    "full fat": "fullfat",
    "low sodium": "lowsodium",
    "semi sweet": "semisweet",
    "half and half": "halfandhalf",
  };
  for (const [spaced, joined] of Object.entries(COMPOUND_WORDS)) {
    normalized = normalized.replace(spaced, joined);
  }

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

// ── Fuzzy Matching: Qualifier Stripping ──

// Modifier words safe to strip for matching purposes.
// Multi-word qualifiers MUST come before single-word to avoid partial matches.
const MULTI_WORD_QUALIFIERS = [
  "extra virgin",
  "flat leaf",
];

const SINGLE_WORD_QUALIFIERS = new Set([
  "kosher", "sea", "flaky", "coarse", "fine",
  "virgin",
  "fresh", "dried", "dry",
  "organic",
  "unsalted", "salted",
  "sweetened", "unsweetened",
  "raw", "toasted", "roasted",
  "curly",
]);

// "ground" is only a safe qualifier when the remaining word is a spice/seasoning.
const GROUND_SAFE_NOUNS = new Set([
  "pepper", "cumin", "cinnamon", "ginger", "nutmeg",
  "coriander", "cardamom", "clove", "turmeric",
  "allspice", "mustard", "fennel", "fenugreek",
  "black pepper", "white pepper",
]);

/**
 * Strip qualifier words from an already-normalized ingredient name to produce
 * a fuzzy matching key.  Display names are preserved separately.
 */
export function stripQualifiers(normalizedName: string): string {
  let result = normalizedName;

  // Strip multi-word qualifiers first (longest match first)
  for (const mw of MULTI_WORD_QUALIFIERS) {
    result = result.replace(new RegExp(`\\b${mw}\\b`, "g"), "");
  }

  // Strip single-word qualifiers
  const words = result.trim().replace(/\s+/g, " ").split(" ");
  const filtered = words.filter((w) => !SINGLE_WORD_QUALIFIERS.has(w));

  // Handle "ground" contextually: only strip if the rest is a spice
  const groundIdx = filtered.indexOf("ground");
  if (groundIdx !== -1) {
    const withoutGround = filtered.filter((_, i) => i !== groundIdx);
    const remainder = withoutGround.join(" ");
    if (GROUND_SAFE_NOUNS.has(remainder)) {
      result = remainder;
    } else {
      result = filtered.join(" ");
    }
  } else {
    result = filtered.join(" ");
  }

  result = result.trim().replace(/\s+/g, " ");

  // If stripping removed everything, fall back to the original
  return result || normalizedName;
}

/**
 * Full fuzzy matching pipeline: normalize name then strip qualifiers.
 */
export function normalizeForMatching(name: string): string {
  return stripQualifiers(normalizeIngredientName(name));
}

/**
 * When two items fuzzy-match and merge, keep the longer (more specific) name
 * as the display name.  e.g., "Extra-virgin olive oil" beats "Olive oil".
 */
export function pickDisplayName(a: string, b: string): string {
  return a.length >= b.length ? a : b;
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
  // Key: `${matchingKey}|${normalizedUnit}` — matchingKey is the qualifier-stripped
  // normalized name so that "kosher salt" and "salt" merge.
  const accumulator = new Map<string, AccumulatorEntry>();

  for (const { meal, recipe } of meals) {
    const servingMultiplier =
      (meal.servingsOverride ?? recipe.servings) / recipe.servings;

    for (const ingredient of recipe.ingredients) {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const matchingKey = stripQualifiers(normalizedName);
      const normalizedUnit = normalizeUnit(ingredient.unit);
      const adjustedQuantity =
        ingredient.quantity !== null
          ? Math.round(ingredient.quantity * servingMultiplier * 100) / 100
          : null;

      const key = `${matchingKey}|${normalizedUnit ?? ""}`;

      const existing = accumulator.get(key);
      if (existing) {
        existing.items.push({ quantity: adjustedQuantity, unit: normalizedUnit });
        existing.displayName = pickDisplayName(
          existing.displayName,
          toDisplayName(ingredient.name),
        );
        existing.recipeIds.add(recipe.id);
      } else {
        accumulator.set(key, {
          normalizedName: matchingKey,
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
  const categoryOrder = GROCERY_CATEGORY_ORDER;
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
