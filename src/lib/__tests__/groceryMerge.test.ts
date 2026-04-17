import { describe, it, expect } from "vitest";
import { mergeManualAndRecipeQuantity } from "../groceryList";

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
