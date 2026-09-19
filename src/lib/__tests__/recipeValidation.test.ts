import { describe, expect, it } from "vitest";
import { ingredientRaw, validateRecipeUpdate } from "../recipeValidation";

const ingredient = (over: Record<string, unknown> = {}) => ({
  name: "greek yogurt",
  quantity: 1,
  unit: "cup",
  preparation: null,
  category: "dairy",
  raw: "1 cup greek yogurt",
  ...over,
});

describe("validateRecipeUpdate", () => {
  it("accepts a full editor payload and trims strings", () => {
    const result = validateRecipeUpdate({
      title: "  Shrimp Tacos ",
      description: " ",
      cuisine: "mexican",
      mealType: "dinner",
      difficulty: "easy",
      servings: 4,
      totalTimeMinutes: 30,
      ingredients: [ingredient()],
      instructions: ["Cook", "  ", "Serve"],
      tags: ["quick", " quick ", "weeknight"],
      isSlowCooker: false,
    });
    expect(result).toEqual({
      ok: true,
      updates: {
        title: "Shrimp Tacos",
        description: null,
        cuisine: "mexican",
        mealType: "dinner",
        difficulty: "easy",
        servings: 4,
        totalTimeMinutes: 30,
        ingredients: [ingredient()],
        instructions: ["Cook", "Serve"],
        tags: ["quick", "weeknight"],
        isSlowCooker: false,
      },
    });
  });

  it("only touches keys present in the body", () => {
    const result = validateRecipeUpdate({ mealType: "dinner" });
    expect(result).toEqual({ ok: true, updates: { mealType: "dinner" } });
  });

  it("ignores keys the user may not edit", () => {
    const result = validateRecipeUpdate({ title: "X", household_id: "evil", nutrition: { calories: 1 } });
    expect(result).toEqual({ ok: true, updates: { title: "X" } });
  });

  it("rejects rather than coerces a bad meal type", () => {
    // Coercing would recreate the "saved Dinner, got Breakfast" bug
    expect(validateRecipeUpdate({ mealType: "brunch" })).toEqual({ ok: false, error: "Invalid meal type" });
  });

  it("rejects servings below 1 (DB CHECK constraint would 500 otherwise)", () => {
    expect(validateRecipeUpdate({ servings: 0 }).ok).toBe(false);
    expect(validateRecipeUpdate({ servings: 2.5 }).ok).toBe(false);
    expect(validateRecipeUpdate({ servings: "4" }).ok).toBe(false);
  });

  it("treats a zero total time as unknown", () => {
    expect(validateRecipeUpdate({ totalTimeMinutes: 0 })).toEqual({ ok: true, updates: { totalTimeMinutes: null } });
    expect(validateRecipeUpdate({ totalTimeMinutes: null })).toEqual({ ok: true, updates: { totalTimeMinutes: null } });
    expect(validateRecipeUpdate({ totalTimeMinutes: -5 }).ok).toBe(false);
  });

  it("requires every ingredient to have a name and valid category", () => {
    expect(validateRecipeUpdate({ ingredients: [ingredient({ name: " " })] })).toEqual({
      ok: false,
      error: "Ingredient 1 needs a name",
    });
    expect(validateRecipeUpdate({ ingredients: [ingredient({ category: "snacks" })] }).ok).toBe(false);
    expect(validateRecipeUpdate({ ingredients: [] }).ok).toBe(false);
  });

  it("normalizes empty unit/prep to null and rebuilds a missing raw line", () => {
    const result = validateRecipeUpdate({
      ingredients: [ingredient({ unit: " ", preparation: "", raw: "", quantity: 2 })],
    });
    expect(result).toEqual({
      ok: true,
      updates: {
        ingredients: [{ name: "greek yogurt", quantity: 2, unit: null, preparation: null, category: "dairy", raw: "2 greek yogurt" }],
      },
    });
  });

  it("rejects an empty payload and non-object bodies", () => {
    expect(validateRecipeUpdate({})).toEqual({ ok: false, error: "Nothing to update" });
    expect(validateRecipeUpdate(null).ok).toBe(false);
    expect(validateRecipeUpdate([]).ok).toBe(false);
  });
});

describe("ingredientRaw", () => {
  it("joins the structured fields the way the source line would read", () => {
    expect(ingredientRaw({ quantity: 2, unit: "tbsp", name: "olive oil", preparation: null })).toBe("2 tbsp olive oil");
    expect(ingredientRaw({ quantity: 1, unit: null, name: "onion", preparation: "diced" })).toBe("1 onion, diced");
    expect(ingredientRaw({ quantity: null, unit: null, name: "salt", preparation: null })).toBe("salt");
  });
});
