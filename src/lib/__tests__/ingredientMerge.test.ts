import { describe, it, expect } from "vitest";
import {
  normalizeIngredientName,
  normalizeUnit,
  canMerge,
  mergeQuantities,
  deduplicateIngredients,
  stripQualifiers,
  normalizeForMatching,
  pickDisplayName,
} from "../ingredientMerge";
import type { Ingredient, MealPlanRecipe, Recipe } from "../types";

// ── normalizeUnit ──

describe("normalizeUnit", () => {
  it("returns null for null/empty", () => {
    expect(normalizeUnit(null)).toBe(null);
    expect(normalizeUnit("")).toBe(null);
    expect(normalizeUnit("  ")).toBe(null);
  });

  it("maps common aliases", () => {
    expect(normalizeUnit("tablespoon")).toBe("tbsp");
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
    expect(normalizeUnit("Tablespoon")).toBe("tbsp");
    expect(normalizeUnit("teaspoon")).toBe("tsp");
    expect(normalizeUnit("ounce")).toBe("oz");
    expect(normalizeUnit("ounces")).toBe("oz");
    expect(normalizeUnit("pound")).toBe("lb");
    expect(normalizeUnit("pounds")).toBe("lb");
    expect(normalizeUnit("lbs")).toBe("lb");
    expect(normalizeUnit("cups")).toBe("cup");
    expect(normalizeUnit("cloves")).toBe("clove");
    expect(normalizeUnit("cans")).toBe("can");
  });

  it("passes through unknown units", () => {
    expect(normalizeUnit("handful")).toBe("handful");
    expect(normalizeUnit("drizzle")).toBe("drizzle");
  });
});

// ── normalizeIngredientName ──

describe("normalizeIngredientName", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientName("  Chicken Breast  ")).toBe("chicken breast");
  });

  it("collapses whitespace", () => {
    expect(normalizeIngredientName("bell   pepper")).toBe("bell pepper");
  });

  it("strips simple plural 's'", () => {
    expect(normalizeIngredientName("onions")).toBe("onion");
    expect(normalizeIngredientName("peppers")).toBe("pepper");
    expect(normalizeIngredientName("limes")).toBe("lime");
  });

  it("handles 'ies' → 'y'", () => {
    expect(normalizeIngredientName("berries")).toBe("berry");
    expect(normalizeIngredientName("cherries")).toBe("cherry");
  });

  it("handles 'oes' → 'o'", () => {
    expect(normalizeIngredientName("tomatoes")).toBe("tomato");
    expect(normalizeIngredientName("potatoes")).toBe("potato");
  });

  it("handles 'ves' → 'f'", () => {
    expect(normalizeIngredientName("halves")).toBe("half");
  });

  it("does not strip 'ss' endings", () => {
    expect(normalizeIngredientName("lemongrass")).toBe("lemongrass");
  });

  it("preserves plural exceptions", () => {
    expect(normalizeIngredientName("hummus")).toBe("hummus");
    expect(normalizeIngredientName("couscous")).toBe("couscous");
    expect(normalizeIngredientName("asparagus")).toBe("asparagus");
  });

  it("does not strip 's' from short words", () => {
    expect(normalizeIngredientName("gas")).toBe("gas");
  });

  it("strips parentheticals", () => {
    expect(normalizeIngredientName("tomatoes (Roma)")).toBe("tomato");
    expect(normalizeIngredientName("cheese (shredded)")).toBe("cheese");
  });

  it("strips trailing commas", () => {
    expect(normalizeIngredientName("garlic,")).toBe("garlic");
    expect(normalizeIngredientName("cilantro , ")).toBe("cilantro");
  });

  it("normalizes hyphens to spaces", () => {
    expect(normalizeIngredientName("oil-vinegar")).toBe("oil vinegar");
  });

  it("normalizes compound word variants", () => {
    expect(normalizeIngredientName("nonfat greek yogurt")).toBe(
      "nonfat greek yogurt",
    );
    expect(normalizeIngredientName("non fat greek yogurt")).toBe(
      "nonfat greek yogurt",
    );
    expect(normalizeIngredientName("non-fat greek yogurt")).toBe(
      "nonfat greek yogurt",
    );
    expect(normalizeIngredientName("low fat milk")).toBe("lowfat milk");
    expect(normalizeIngredientName("low-fat milk")).toBe("lowfat milk");
    expect(normalizeIngredientName("semi-sweet chocolate chips")).toBe(
      "semisweet chocolate chip",
    );
  });
});

// ── stripQualifiers ──

describe("stripQualifiers", () => {
  it("strips kosher from salt", () => {
    expect(stripQualifiers("kosher salt")).toBe("salt");
  });

  it("strips sea from salt", () => {
    expect(stripQualifiers("sea salt")).toBe("salt");
  });

  it("strips extra virgin from olive oil", () => {
    expect(stripQualifiers("extra virgin olive oil")).toBe("olive oil");
  });

  it("strips fresh from herbs", () => {
    expect(stripQualifiers("fresh basil")).toBe("basil");
    expect(stripQualifiers("fresh ginger")).toBe("ginger");
  });

  it("strips dried from herbs", () => {
    expect(stripQualifiers("dried oregano")).toBe("oregano");
    expect(stripQualifiers("dried thyme")).toBe("thyme");
  });

  it("strips unsalted from butter", () => {
    expect(stripQualifiers("unsalted butter")).toBe("butter");
  });

  it("strips organic", () => {
    expect(stripQualifiers("organic milk")).toBe("milk");
  });

  it("strips roasted/toasted", () => {
    expect(stripQualifiers("roasted garlic")).toBe("garlic");
    expect(stripQualifiers("toasted sesame oil")).toBe("sesame oil");
  });

  it("strips ground when followed by a spice", () => {
    expect(stripQualifiers("ground cumin")).toBe("cumin");
    expect(stripQualifiers("ground cinnamon")).toBe("cinnamon");
    expect(stripQualifiers("ground black pepper")).toBe("black pepper");
  });

  it("keeps ground when followed by a protein", () => {
    expect(stripQualifiers("ground turkey")).toBe("ground turkey");
    expect(stripQualifiers("ground beef")).toBe("ground beef");
    expect(stripQualifiers("ground chicken")).toBe("ground chicken");
  });

  it("does not strip identity words from proteins", () => {
    expect(stripQualifiers("chicken breast")).toBe("chicken breast");
    expect(stripQualifiers("chicken thigh")).toBe("chicken thigh");
  });

  it("is a no-op for plain ingredient names", () => {
    expect(stripQualifiers("salt")).toBe("salt");
    expect(stripQualifiers("olive oil")).toBe("olive oil");
    expect(stripQualifiers("butter")).toBe("butter");
    expect(stripQualifiers("garlic")).toBe("garlic");
  });

  it("handles multiple qualifiers", () => {
    expect(stripQualifiers("fresh organic basil")).toBe("basil");
  });

  it("does not produce empty string", () => {
    // edge case: name is all qualifiers — should return original
    expect(stripQualifiers("fresh dried")).toBe("fresh dried");
  });

  it("strips flaky from salt", () => {
    expect(stripQualifiers("flaky sea salt")).toBe("salt");
  });
});

// ── normalizeForMatching ──

describe("normalizeForMatching", () => {
  it("full pipeline: Kosher Salt → salt", () => {
    expect(normalizeForMatching("Kosher Salt")).toBe("salt");
  });

  it("full pipeline: Extra-Virgin Olive Oil → olive oil", () => {
    expect(normalizeForMatching("Extra-Virgin Olive Oil")).toBe("olive oil");
  });

  it("full pipeline: Fresh Basil Leaves → basil leaf", () => {
    // normalizeIngredientName strips plural "leaves" → "leaf" (ves→f)
    // stripQualifiers strips "fresh"
    expect(normalizeForMatching("Fresh Basil Leaves")).toBe("basil leaf");
  });

  it("full pipeline: Ground Turkey stays as ground turkey", () => {
    expect(normalizeForMatching("Ground Turkey")).toBe("ground turkey");
  });
});

// ── pickDisplayName ──

describe("pickDisplayName", () => {
  it("returns the longer (more specific) name", () => {
    expect(pickDisplayName("Kosher salt", "Salt")).toBe("Kosher salt");
    expect(pickDisplayName("Salt", "Kosher salt")).toBe("Kosher salt");
  });

  it("returns the longer name for olive oil variants", () => {
    expect(pickDisplayName("Extra-virgin olive oil", "Olive oil")).toBe(
      "Extra-virgin olive oil",
    );
  });

  it("returns first when equal length", () => {
    expect(pickDisplayName("Salt", "Salt")).toBe("Salt");
  });
});

// ── canMerge ──

describe("canMerge", () => {
  it("merges same name and unit", () => {
    expect(
      canMerge(
        { normalizedName: "butter", unit: "tbsp" },
        { normalizedName: "butter", unit: "tbsp" },
      ),
    ).toBe(true);
  });

  it("merges same name, both null units", () => {
    expect(
      canMerge(
        { normalizedName: "salt", unit: null },
        { normalizedName: "salt", unit: null },
      ),
    ).toBe(true);
  });

  it("does not merge different names", () => {
    expect(
      canMerge(
        { normalizedName: "butter", unit: "tbsp" },
        { normalizedName: "oil", unit: "tbsp" },
      ),
    ).toBe(false);
  });

  it("does not merge different units", () => {
    expect(
      canMerge(
        { normalizedName: "milk", unit: "cup" },
        { normalizedName: "milk", unit: "tbsp" },
      ),
    ).toBe(false);
  });

  it("does not merge null unit with non-null", () => {
    expect(
      canMerge(
        { normalizedName: "garlic", unit: null },
        { normalizedName: "garlic", unit: "clove" },
      ),
    ).toBe(false);
  });
});

// ── mergeQuantities ──

describe("mergeQuantities", () => {
  it("sums quantities with matching units", () => {
    const result = mergeQuantities([
      { quantity: 1, unit: "tbsp" },
      { quantity: 2, unit: "tbsp" },
    ]);
    expect(result).toEqual({ quantity: 3, unit: "tbsp" });
  });

  it("returns null quantity when any item has null", () => {
    const result = mergeQuantities([
      { quantity: 1, unit: null },
      { quantity: null, unit: null },
    ]);
    expect(result).toEqual({ quantity: null, unit: null });
  });

  it("handles empty input", () => {
    expect(mergeQuantities([])).toEqual({ quantity: null, unit: null });
  });

  it("rounds to avoid floating point issues", () => {
    const result = mergeQuantities([
      { quantity: 0.1, unit: "cup" },
      { quantity: 0.2, unit: "cup" },
    ]);
    expect(result).toEqual({ quantity: 0.3, unit: "cup" });
  });
});

// ── deduplicateIngredients ──

describe("deduplicateIngredients", () => {
  const makeIngredient = (
    overrides: Partial<Ingredient> & { name: string },
  ): Ingredient => ({
    quantity: null,
    unit: null,
    preparation: null,
    category: "other",
    raw: overrides.name,
    ...overrides,
  });

  const makeRecipe = (
    id: string,
    ingredients: Ingredient[],
    servings = 4,
  ): Recipe => ({
    id,
    householdId: "hh-1",
    title: `Recipe ${id}`,
    sourceUrl: null,
    sourceName: null,
    description: null,
    cuisine: "american",
    mealType: "dinner",
    difficulty: "medium",
    servings,
    totalTimeMinutes: 30,
    ingredients,
    instructions: [],
    nutrition: null,
    dietaryFlags: [],
    tags: [],
    imageUrl: null,
    isSlowCooker: false,
    createdAt: "",
    updatedAt: "",
  });

  const makeMeal = (
    recipe: Recipe,
    servingsOverride: number | null = null,
  ): { meal: MealPlanRecipe; recipe: Recipe } => ({
    meal: {
      id: `meal-${recipe.id}`,
      householdId: "hh-1",
      mealPlanId: "plan-1",
      recipeId: recipe.id,
      dayOfWeek: 0,
      mealType: "dinner",
      servingsOverride,
    },
    recipe,
  });

  it("merges same ingredient from two recipes", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "butter", quantity: 1, unit: "tbsp" }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "Butter", quantity: 2, unit: "tablespoons" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("butter");
    expect(result[0].quantity).toBe(3);
    expect(result[0].unit).toBe("tbsp");
    expect(result[0].recipeIds).toContain("r1");
    expect(result[0].recipeIds).toContain("r2");
  });

  it("keeps ingredients with different units separate", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "milk", quantity: 1, unit: "cup" }),
      makeIngredient({ name: "milk", quantity: 2, unit: "tbsp" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1)]);

    expect(result).toHaveLength(2);
    const cupItem = result.find((i) => i.unit === "cup");
    const tbspItem = result.find((i) => i.unit === "tbsp");
    expect(cupItem?.quantity).toBe(1);
    expect(tbspItem?.quantity).toBe(2);
  });

  it("applies serving multiplier", () => {
    const r1 = makeRecipe(
      "r1",
      [makeIngredient({ name: "chicken", quantity: 4, unit: "oz", category: "meat" })],
      4, // recipe serves 4
    );

    // Override to 2 servings → halve quantities
    const result = deduplicateIngredients([makeMeal(r1, 2)]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(result[0].category).toBe("Protein"); // meat → Protein
  });

  it("handles null quantities (salt + salt = salt with null qty)", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "salt", quantity: null, unit: null }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "Salt", quantity: null, unit: null }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(null);
  });

  it("maps ingredient categories to grocery display categories", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "chicken breast", category: "meat" }),
      makeIngredient({ name: "shrimp", category: "seafood" }),
      makeIngredient({ name: "bell pepper", category: "produce" }),
      makeIngredient({ name: "milk", category: "dairy" }),
      makeIngredient({ name: "rice", category: "grain" }),
      makeIngredient({ name: "olive oil", category: "oil-vinegar" }),
      makeIngredient({ name: "tomato sauce", category: "canned" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1)]);

    const byName = (n: string) => result.find((i) => i.name === normalizeIngredientName(n));
    expect(byName("chicken breast")?.category).toBe("Protein");
    expect(byName("shrimp")?.category).toBe("Protein");
    expect(byName("bell pepper")?.category).toBe("Produce");
    expect(byName("milk")?.category).toBe("Dairy");
    expect(byName("rice")?.category).toBe("Pantry");
    expect(byName("olive oil")?.category).toBe("Pantry");
    expect(byName("tomato sauce")?.category).toBe("Pantry");
  });

  it("sorts by category order then alphabetically", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "rice", category: "grain" }),
      makeIngredient({ name: "chicken", category: "meat" }),
      makeIngredient({ name: "garlic", category: "produce" }),
      makeIngredient({ name: "apple", category: "produce" }),
      makeIngredient({ name: "yogurt", category: "dairy" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1)]);
    const names = result.map((i) => i.displayName);

    // Protein first, then Produce (alpha), then Dairy, then Pantry
    expect(names).toEqual(["Chicken", "Apple", "Garlic", "Yogurt", "Rice"]);
  });

  it("capitalizes display name", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "ground turkey", category: "meat" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1)]);
    expect(result[0].displayName).toBe("Ground turkey");
  });

  it("deduplicates plurals", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "tomato", quantity: 2, unit: null, category: "produce" }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "tomatoes", quantity: 3, unit: null, category: "produce" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
  });

  it("handles empty meals list", () => {
    expect(deduplicateIngredients([])).toEqual([]);
  });

  // ── Fuzzy matching via qualifier stripping ──

  it("merges kosher salt with salt from different recipes", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "kosher salt", quantity: 1, unit: "tsp", category: "spice" }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "salt", quantity: 0.5, unit: "tsp", category: "spice" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1.5);
    expect(result[0].displayName).toBe("Kosher salt"); // more specific wins
    expect(result[0].recipeIds).toContain("r1");
    expect(result[0].recipeIds).toContain("r2");
  });

  it("merges extra-virgin olive oil with olive oil", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "extra-virgin olive oil", quantity: 2, unit: "tbsp", category: "oil-vinegar" }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "olive oil", quantity: 1, unit: "tbsp", category: "oil-vinegar" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
    expect(result[0].displayName).toBe("Extra-virgin olive oil");
  });

  it("keeps chicken breast and chicken thigh separate", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "chicken breast", quantity: 1, unit: "lb", category: "meat" }),
      makeIngredient({ name: "chicken thigh", quantity: 1, unit: "lb", category: "meat" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1)]);

    expect(result).toHaveLength(2);
  });

  it("keeps ground turkey and turkey breast separate", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "ground turkey", quantity: 1, unit: "lb", category: "meat" }),
      makeIngredient({ name: "turkey breast", quantity: 1, unit: "lb", category: "meat" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1)]);

    expect(result).toHaveLength(2);
  });

  it("merges ground cumin with cumin", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "ground cumin", quantity: 1, unit: "tsp", category: "spice" }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "cumin", quantity: 0.5, unit: "tsp", category: "spice" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1.5);
    expect(result[0].displayName).toBe("Ground cumin");
  });

  it("merges fresh basil with basil", () => {
    const r1 = makeRecipe("r1", [
      makeIngredient({ name: "fresh basil", quantity: 0.25, unit: "cup", category: "produce" }),
    ]);
    const r2 = makeRecipe("r2", [
      makeIngredient({ name: "basil", quantity: 0.25, unit: "cup", category: "produce" }),
    ]);

    const result = deduplicateIngredients([makeMeal(r1), makeMeal(r2)]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(0.5);
    expect(result[0].displayName).toBe("Fresh basil");
  });
});
