import { describe, expect, it } from "vitest";
import { normalizeShoppingName } from "../shoppingName";
import { deduplicateIngredients, normalizeIngredientName, groceryNameFor } from "../ingredientMerge";
import type { Ingredient, MealPlanRecipe, Recipe } from "../types";

function ing(name: string, over: Partial<Ingredient> = {}): Ingredient {
  return { name, quantity: 1, unit: "cup", preparation: null, category: "dairy", raw: `1 cup ${name}`, ...over };
}
function recipe(id: string, ingredients: Ingredient[]): Recipe {
  return {
    id, householdId: "h", title: id, sourceUrl: null, sourceName: null, description: null, cuisine: "other",
    mealType: "dinner", difficulty: "easy", servings: 2, totalTimeMinutes: null, ingredients, instructions: ["x"],
    nutrition: null, dietaryFlags: [], tags: [], imageUrl: null, isSlowCooker: false, createdAt: "", updatedAt: "",
  };
}
function meal(r: Recipe): { meal: MealPlanRecipe; recipe: Recipe } {
  return { meal: { id: `m-${r.id}`, householdId: "h", mealPlanId: "p", recipeId: r.id, dayOfWeek: 0, mealType: "dinner", servingsOverride: null }, recipe: r };
}

describe("normalizeShoppingName", () => {
  it("lowercases, trims, collapses whitespace, and rejects empties", () => {
    expect(normalizeShoppingName("  Greek   Yogurt ")).toBe("greek yogurt");
    expect(normalizeShoppingName("")).toBeNull();
    expect(normalizeShoppingName("   ")).toBeNull();
    expect(normalizeShoppingName(null)).toBeNull();
    expect(normalizeShoppingName(42)).toBeNull();
  });
});

describe("rule-only normalization improvements", () => {
  it("strips percent tokens on dairy only and unifies spelling variants", () => {
    expect(normalizeIngredientName("100% greek yoghurt")).toBe("greek yogurt");
    expect(normalizeIngredientName("2% milk")).toBe("milk");
    expect(normalizeIngredientName("nonfat 0% yogurt")).toBe("nonfat yogurt");
    // The percentage is the product here — keep it
    expect(normalizeIngredientName("70% dark chocolate")).toBe("70% dark chocolate");
    expect(normalizeIngredientName("70% dark chocolate")).not.toBe(normalizeIngredientName("85% dark chocolate"));
    expect(normalizeIngredientName("5% vinegar")).toBe("5% vinegar");
    // Regional names that are different products stay distinct
    expect(normalizeIngredientName("ground coriander")).toBe("ground coriander");
    expect(normalizeIngredientName("red chillies")).toBe(normalizeIngredientName("red chilies"));
    expect(normalizeIngredientName("aubergine")).toBe("eggplant");
  });

  it("merges '100% greek yoghurt' with 'greek yogurt' without any shoppingName", () => {
    const merged = deduplicateIngredients([
      meal(recipe("a", [ing("100% greek yoghurt")])),
      meal(recipe("b", [ing("greek yogurt")])),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(2);
  });
});

describe("shoppingName as the merge key", () => {
  it("merges a branded ingredient with a generic one when the importer produced a shopping name", () => {
    const merged = deduplicateIngredients([
      meal(recipe("a", [ing("FAGE 100% greek yoghurt", { shoppingName: "greek yogurt" })])),
      meal(recipe("b", [ing("plain greek yogurt", { shoppingName: "greek yogurt" })])),
      meal(recipe("c", [ing("greek yogurt")])), // older recipe, no shoppingName
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].displayName).toBe("Greek yogurt");
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].recipeIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("displays the canonical name even when a branded original is longer", () => {
    const merged = deduplicateIngredients([
      meal(recipe("a", [ing("greek yogurt")])),
      meal(recipe("b", [ing("FAGE Total 5% Greek Yoghurt", { shoppingName: "greek yogurt" })])),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].displayName).toBe("Greek yogurt");
  });

  it("keeps items apart when their shopping names differ (form and cut matter)", () => {
    const merged = deduplicateIngredients([
      meal(recipe("a", [ing("San Marzano tomatoes", { shoppingName: "canned tomatoes", category: "canned" })])),
      meal(recipe("b", [ing("vine tomatoes", { shoppingName: "tomatoes", category: "produce" })])),
    ]);
    expect(merged.map((m) => m.displayName).sort()).toEqual(["Canned tomatoes", "Tomatoes"]);
  });

  it("falls back to the ingredient name when shoppingName is null or blank", () => {
    expect(groceryNameFor({ name: "butter", shoppingName: null })).toEqual({ text: "butter", canonical: false });
    expect(groceryNameFor({ name: "butter", shoppingName: "  " })).toEqual({ text: "butter", canonical: false });
    expect(groceryNameFor({ name: "Kerrygold butter", shoppingName: "butter" })).toEqual({ text: "butter", canonical: true });
  });
});
