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
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  floz: "fl oz",
  package: "package",
  packages: "package",
  pkg: "package",
  jar: "jar",
  jars: "jar",
  bottle: "bottle",
  bottles: "bottle",
  bag: "bag",
  bags: "bag",
  box: "box",
  boxes: "box",
  container: "container",
  containers: "container",
  stick: "stick",
  sticks: "stick",
  handful: "handful",
  handfuls: "handful",
};

// ── Unit Families (for cross-unit merging) ──
// Same ingredient in different units of the same family should merge into one
// list item ("2 tbsp butter" + "1/2 cup butter" → "10 tbsp butter"), not two.
// "oz" is deliberately weight-only: bare "oz" on liquids is ambiguous, and
// keeping it out of the volume family means we never mis-convert it.

const VOLUME_IN_TSP: Record<string, number> = {
  tsp: 1,
  tbsp: 3,
  "fl oz": 6,
  cup: 48,
  pt: 96,
  qt: 192,
  gal: 768,
  mL: 0.202884,
  L: 202.884,
};

const WEIGHT_IN_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

export type UnitFamily = "volume" | "weight";

export function unitFamily(unit: string | null): UnitFamily | null {
  if (!unit) return null;
  if (unit in VOLUME_IN_TSP) return "volume";
  if (unit in WEIGHT_IN_G) return "weight";
  return null;
}

function familyTable(family: UnitFamily): Record<string, number> {
  return family === "volume" ? VOLUME_IN_TSP : WEIGHT_IN_G;
}

/** Pick a readable display unit for a converted total: the largest unit that
 *  appeared among the merged items where the total is still >= 1. */
function pickDisplayUnit(units: string[], totalInBase: number, table: Record<string, number>): string {
  const unique = [...new Set(units)].sort((a, b) => table[a] - table[b]);
  for (let i = unique.length - 1; i >= 0; i--) {
    if (totalInBase / table[unique[i]] >= 1) return unique[i];
  }
  return unique[0];
}

/**
 * Sum two quantities whose units are in the same family, converting as needed.
 * Returns null when the units are not convertible into each other.
 */
export function sumConvertibleQuantities(
  a: { quantity: number; unit: string },
  b: { quantity: number; unit: string },
): { quantity: number; unit: string } | null {
  const family = unitFamily(a.unit);
  if (family === null || unitFamily(b.unit) !== family) return null;
  const table = familyTable(family);
  const totalInBase = a.quantity * table[a.unit] + b.quantity * table[b.unit];
  const unit = pickDisplayUnit([a.unit, b.unit], totalInBase, table);
  return { quantity: Math.round((totalInBase / table[unit]) * 100) / 100, unit };
}

export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const lower = unit.toLowerCase().trim();
  if (!lower) return null;
  return UNIT_ALIASES[lower] ?? lower;
}

// ── Name Normalization ──

// Plurals ending in -ves whose singular ends in -ve (strip only the 's')
const VES_TO_VE = new Set(["olives", "chives", "cloves", "endives"]);

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
    // Handle 'ves' → 'f' (e.g., 'halves' → 'half'), except words whose
    // singular ends in '-ve' ('olives' → 'olive', not 'olif')
    else if (normalized.endsWith("ves")) {
      const words = normalized.split(" ");
      const last = words[words.length - 1];
      if (VES_TO_VE.has(last)) {
        words[words.length - 1] = last.slice(0, -1);
        normalized = words.join(" ");
      } else {
        normalized = normalized.slice(0, -3) + "f";
      }
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

// Count words that recipes sometimes put in the name instead of the unit
// ("3 garlic cloves" vs "3 cloves garlic"). Stripped from the matching key,
// and promoted to the unit during dedup when the item has none.
const COUNT_UNIT_WORDS = new Set([
  "clove", "bunch", "head", "stalk", "sprig", "stick", "slice",
]);

// Whole-name synonyms applied after qualifier stripping — pairs that are the
// same grocery purchase even though the words differ. Deliberately tiny:
// merging here is only safe when the mapping is unambiguous.
const MATCHING_SYNONYMS: Record<string, string> = {
  "yellow onion": "onion",
  scallion: "green onion",
};

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

  // Drop a trailing count word ("garlic clove" → "garlic") so name-embedded
  // counts match unit-based ones — but never when it's the whole name
  // ("cloves" the spice stays "clove").
  const resultWords = result.split(" ");
  if (resultWords.length > 1 && COUNT_UNIT_WORDS.has(resultWords[resultWords.length - 1])) {
    result = resultWords.slice(0, -1).join(" ");
  }

  result = MATCHING_SYNONYMS[result] ?? result;

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
  if (a.unit === b.unit) return true;
  // Different units in the same family (all volume / all weight) → convertible
  const family = unitFamily(a.unit);
  return family !== null && unitFamily(b.unit) === family;
}

export function mergeQuantities(
  items: { quantity: number | null; unit: string | null }[],
): { quantity: number | null; unit: string | null } {
  if (items.length === 0) return { quantity: null, unit: null };

  // If any quantity is null, result is null (can't sum unknown amounts)
  if (items.some((i) => i.quantity === null)) {
    return { quantity: null, unit: items[0].unit };
  }

  const units = [...new Set(items.map((i) => i.unit))];
  if (units.length === 1) {
    const total = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    // Round to avoid floating point weirdness (e.g., 0.1 + 0.2)
    return { quantity: Math.round(total * 100) / 100, unit: units[0] };
  }

  // Mixed units — only reachable for same-family (convertible) units
  const family = unitFamily(items[0].unit);
  if (family === null) {
    // Shouldn't happen given the grouping key; fall back to the first unit
    const total = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    return { quantity: Math.round(total * 100) / 100, unit: items[0].unit };
  }
  const table = familyTable(family);
  const totalInBase = items.reduce(
    (sum, i) => sum + (i.quantity ?? 0) * table[i.unit as string],
    0,
  );
  const unit = pickDisplayUnit(items.map((i) => i.unit as string), totalInBase, table);
  return { quantity: Math.round((totalInBase / table[unit]) * 100) / 100, unit };
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
    // Guard against bad data: a recipe with servings <= 0 would turn every
    // quantity into NaN/Infinity. Fall back to no scaling.
    const servingMultiplier =
      recipe.servings > 0
        ? (meal.servingsOverride ?? recipe.servings) / recipe.servings
        : 1;

    for (const ingredient of recipe.ingredients) {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const matchingKey = stripQualifiers(normalizedName);
      let normalizedUnit = normalizeUnit(ingredient.unit);

      // "3 garlic cloves" carries its count word in the name — promote it to
      // the unit so it groups with "3 cloves garlic" (unit: clove)
      if (normalizedUnit === null) {
        const nameWords = normalizedName.split(" ");
        const lastWord = nameWords[nameWords.length - 1];
        if (nameWords.length > 1 && COUNT_UNIT_WORDS.has(lastWord)) {
          normalizedUnit = lastWord;
        }
      }
      const adjustedQuantity =
        ingredient.quantity !== null
          ? Math.round(ingredient.quantity * servingMultiplier * 100) / 100
          : null;

      // Units in the same family (volume/weight) group together so they can
      // be converted and summed; other units group by exact unit.
      const family = unitFamily(normalizedUnit);
      const key = `${matchingKey}|${family ?? normalizedUnit ?? ""}`;

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
