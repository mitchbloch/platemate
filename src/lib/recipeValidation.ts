import type {
  CuisineType,
  DietaryFlag,
  DifficultyLevel,
  Ingredient,
  IngredientCategory,
  MealType,
  ParsedRecipe,
} from "./types";

// ── Enum lists (single source of truth for parser + validation) ──

export const CUISINES: readonly CuisineType[] = ["american", "italian", "mexican", "asian", "mediterranean", "indian", "middle-eastern", "french", "other"];
export const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snacks"];
export const DIFFICULTIES: readonly DifficultyLevel[] = ["easy", "medium", "hard"];
export const INGREDIENT_CATEGORIES: readonly IngredientCategory[] = ["produce", "meat", "seafood", "dairy", "grain", "canned", "spice", "oil-vinegar", "condiment", "frozen", "other"];
export const DIETARY_FLAGS: readonly DietaryFlag[] = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "shellfish-free", "low-sodium", "low-cholesterol"];

// ── Coercion helpers (used for untrusted Claude output) ──

/** Coerce a value to one of the allowed enum members, or the fallback. */
export function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Coerce a value to a finite non-negative number, or the fallback. */
export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Rebuild the display line for an ingredient from its structured fields. */
export function ingredientRaw(ing: Pick<Ingredient, "quantity" | "unit" | "name" | "preparation">): string {
  const head = [ing.quantity ?? "", ing.unit ?? "", ing.name].map((s) => String(s).trim()).filter(Boolean).join(" ");
  return ing.preparation?.trim() ? `${head}, ${ing.preparation.trim()}` : head;
}

// ── User-edit validation (strict: reject, don't coerce) ──

/** The fields a user may change through the editor. */
export type RecipeUpdates = Partial<
  Pick<
    ParsedRecipe,
    | "title"
    | "description"
    | "cuisine"
    | "mealType"
    | "difficulty"
    | "servings"
    | "totalTimeMinutes"
    | "ingredients"
    | "instructions"
    | "tags"
    | "isSlowCooker"
  >
>;

export type ValidationResult =
  | { ok: true; updates: RecipeUpdates }
  | { ok: false; error: string };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function isEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function validateIngredient(value: unknown, index: number): Ingredient | string {
  if (!value || typeof value !== "object") return `Ingredient ${index + 1} is malformed`;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name) return `Ingredient ${index + 1} needs a name`;

  let quantity: number | null = null;
  if (v.quantity !== null && v.quantity !== undefined) {
    if (typeof v.quantity !== "number" || !Number.isFinite(v.quantity) || v.quantity < 0) {
      return `Ingredient "${name}" has an invalid quantity`;
    }
    quantity = v.quantity;
  }
  if (v.unit !== null && v.unit !== undefined && typeof v.unit !== "string") {
    return `Ingredient "${name}" has an invalid unit`;
  }
  if (v.preparation !== null && v.preparation !== undefined && typeof v.preparation !== "string") {
    return `Ingredient "${name}" has invalid preparation notes`;
  }
  if (!isEnum(v.category, INGREDIENT_CATEGORIES)) {
    return `Ingredient "${name}" has an invalid category`;
  }

  const unit = typeof v.unit === "string" && v.unit.trim() ? v.unit.trim() : null;
  const preparation = typeof v.preparation === "string" && v.preparation.trim() ? v.preparation.trim() : null;
  const structured = { name, quantity, unit, preparation };
  return {
    ...structured,
    category: v.category,
    raw: typeof v.raw === "string" && v.raw.trim() ? v.raw.trim() : ingredientRaw(structured),
  };
}

/**
 * Validate a recipe edit payload. Only known editable keys are read; anything
 * else in the body (household_id, nutrition, ...) is ignored. Invalid values
 * are rejected with a message the UI can show — never silently coerced, since
 * a coerced edit is exactly the "I saved X and got Y" bug this exists to stop.
 */
export function validateRecipeUpdate(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request body");
  const b = body as Record<string, unknown>;
  const updates: RecipeUpdates = {};

  if ("title" in b) {
    if (typeof b.title !== "string" || !b.title.trim()) return fail("Title is required");
    updates.title = b.title.trim();
  }
  if ("description" in b) {
    if (b.description !== null && typeof b.description !== "string") return fail("Description must be text");
    updates.description = typeof b.description === "string" && b.description.trim() ? b.description.trim() : null;
  }
  if ("cuisine" in b) {
    if (!isEnum(b.cuisine, CUISINES)) return fail("Invalid cuisine");
    updates.cuisine = b.cuisine;
  }
  if ("mealType" in b) {
    if (!isEnum(b.mealType, MEAL_TYPES)) return fail("Invalid meal type");
    updates.mealType = b.mealType;
  }
  if ("difficulty" in b) {
    if (!isEnum(b.difficulty, DIFFICULTIES)) return fail("Invalid difficulty");
    updates.difficulty = b.difficulty;
  }
  if ("servings" in b) {
    if (typeof b.servings !== "number" || !Number.isInteger(b.servings) || b.servings < 1) {
      return fail("Servings must be a whole number of at least 1");
    }
    updates.servings = b.servings;
  }
  if ("totalTimeMinutes" in b) {
    if (b.totalTimeMinutes !== null) {
      if (typeof b.totalTimeMinutes !== "number" || !Number.isInteger(b.totalTimeMinutes) || b.totalTimeMinutes < 0) {
        return fail("Total time must be a whole number of minutes");
      }
    }
    updates.totalTimeMinutes = b.totalTimeMinutes as number | null;
  }
  if ("ingredients" in b) {
    if (!Array.isArray(b.ingredients)) return fail("Ingredients must be a list");
    const ingredients: Ingredient[] = [];
    for (let i = 0; i < b.ingredients.length; i++) {
      const result = validateIngredient(b.ingredients[i], i);
      if (typeof result === "string") return fail(result);
      ingredients.push(result);
    }
    if (ingredients.length === 0) return fail("A recipe needs at least one ingredient");
    updates.ingredients = ingredients;
  }
  if ("instructions" in b) {
    if (!Array.isArray(b.instructions) || b.instructions.some((s) => typeof s !== "string")) {
      return fail("Instructions must be a list of steps");
    }
    const instructions = (b.instructions as string[]).map((s) => s.trim()).filter(Boolean);
    if (instructions.length === 0) return fail("A recipe needs at least one instruction step");
    updates.instructions = instructions;
  }
  if ("tags" in b) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== "string")) return fail("Tags must be a list");
    updates.tags = [...new Set((b.tags as string[]).map((t) => t.trim()).filter(Boolean))];
  }
  if ("isSlowCooker" in b) {
    if (typeof b.isSlowCooker !== "boolean") return fail("Slow cooker flag must be true or false");
    updates.isSlowCooker = b.isSlowCooker;
  }

  if (Object.keys(updates).length === 0) return fail("Nothing to update");
  return { ok: true, updates };
}
