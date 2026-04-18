import { describe, it, expect } from "vitest";
import { categoryToDb, mergeManualAndRecipeQuantity } from "../groceryList";
import { INGREDIENT_TO_GROCERY_CATEGORY } from "../categoryMap";

describe("mergeManualAndRecipeQuantity", () => {
  it("sums quantities when units match", () => {
    const result = mergeManualAndRecipeQuantity(2, "lb", 1.5, "lb");
    expect(result).toEqual({ quantity: 3.5, unit: "lb" });
  });

  it("sums quantities when both units are null", () => {
    const result = mergeManualAndRecipeQuantity(3, null, 2, null);
    expect(result).toEqual({ quantity: 5, unit: null });
  });

  it("keeps recipe quantity when units differ", () => {
    const result = mergeManualAndRecipeQuantity(1, "bunch", 8, "oz");
    expect(result).toEqual({ quantity: 8, unit: "oz" });
  });

  it("uses non-null quantity when manual qty is null and units match", () => {
    const result = mergeManualAndRecipeQuantity(null, "cup", 2, "cup");
    expect(result).toEqual({ quantity: 2, unit: "cup" });
  });

  it("uses non-null quantity when recipe qty is null and units match", () => {
    const result = mergeManualAndRecipeQuantity(3, "cup", null, "cup");
    expect(result).toEqual({ quantity: 3, unit: "cup" });
  });

  it("returns null quantity when both are null with matching units", () => {
    const result = mergeManualAndRecipeQuantity(null, "cup", null, "cup");
    expect(result).toEqual({ quantity: null, unit: "cup" });
  });

  it("returns null quantity when both are null with null units", () => {
    const result = mergeManualAndRecipeQuantity(null, null, null, null);
    expect(result).toEqual({ quantity: null, unit: null });
  });

  it("normalizes units before comparing (tbsp variants)", () => {
    // normalizeUnit maps "tablespoon" → "tbsp"
    const result = mergeManualAndRecipeQuantity(1, "tablespoon", 2, "tbsp");
    expect(result).toEqual({ quantity: 3, unit: "tbsp" });
  });

  it("rounds to avoid floating point issues", () => {
    const result = mergeManualAndRecipeQuantity(0.1, "cup", 0.2, "cup");
    expect(result).toEqual({ quantity: 0.3, unit: "cup" });
  });

  it("handles recipe authoritative when manual has no unit but recipe does", () => {
    const result = mergeManualAndRecipeQuantity(2, null, 1.5, "lb");
    expect(result).toEqual({ quantity: 1.5, unit: "lb" });
  });

  it("preserves manual quantity when recipe qty is null and units match", () => {
    // garlic: 3 cloves on list, recipe says "garlic" with no qty
    const result = mergeManualAndRecipeQuantity(3, "clove", null, "clove");
    expect(result).toEqual({ quantity: 3, unit: "clove" });
  });

  it("preserves manual quantity when recipe qty is null and both units null", () => {
    const result = mergeManualAndRecipeQuantity(2, null, null, null);
    expect(result).toEqual({ quantity: 2, unit: null });
  });

  it("preserves manual quantity when recipe qty is null with different units", () => {
    // manual: 3 cloves, recipe: garlic (no qty, no unit)
    const result = mergeManualAndRecipeQuantity(3, "clove", null, null);
    expect(result).toEqual({ quantity: 3, unit: "clove" });
  });
});

describe("categoryToDb", () => {
  // The UI submits the capitalized labels from GROCERY_CATEGORY_LABELS
  // ("Protein", "Produce", "Dairy", "Pantry", "Other"). These must map to
  // IngredientCategory values that round-trip back to the same display
  // category via INGREDIENT_TO_GROCERY_CATEGORY; otherwise edits/adds all
  // collapse to "Other".
  it.each([
    ["Protein", "Produce", "Dairy", "Pantry", "Other"] as const,
  ].flat())("%s round-trips to the same display category", (label) => {
    const db = categoryToDb(label);
    expect(INGREDIENT_TO_GROCERY_CATEGORY[db]).toBe(label);
  });

  it("accepts legacy lowercase display values", () => {
    expect(categoryToDb("protein")).toBe("meat");
    expect(categoryToDb("dairy")).toBe("dairy");
    expect(categoryToDb("pantry")).toBe("grain");
  });

  it("passes valid IngredientCategory values through", () => {
    expect(categoryToDb("meat")).toBe("meat");
    expect(categoryToDb("produce")).toBe("produce");
    expect(categoryToDb("grain")).toBe("grain");
  });

  it("falls back to 'other' for unknown values", () => {
    expect(categoryToDb("nonsense")).toBe("other");
  });
});
