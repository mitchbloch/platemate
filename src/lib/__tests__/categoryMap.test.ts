import { describe, it, expect } from "vitest";
import {
  INGREDIENT_TO_GROCERY_CATEGORY,
  GROCERY_CATEGORY_LABELS,
  GROCERY_CATEGORY_ORDER,
} from "../categoryMap";
import type { IngredientCategory, GroceryDisplayCategory } from "../types";

describe("INGREDIENT_TO_GROCERY_CATEGORY", () => {
  const ALL_INGREDIENT_CATEGORIES: IngredientCategory[] = [
    "produce",
    "meat",
    "seafood",
    "dairy",
    "grain",
    "canned",
    "spice",
    "oil-vinegar",
    "condiment",
    "frozen",
    "other",
  ];

  it("maps all 11 ingredient categories", () => {
    for (const cat of ALL_INGREDIENT_CATEGORIES) {
      expect(INGREDIENT_TO_GROCERY_CATEGORY[cat]).toBeDefined();
    }
  });

  it("maps meat and seafood to protein", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["meat"]).toBe("protein");
    expect(INGREDIENT_TO_GROCERY_CATEGORY["seafood"]).toBe("protein");
  });

  it("maps produce to produce", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["produce"]).toBe("produce");
  });

  it("maps dairy to dairy", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["dairy"]).toBe("dairy");
  });

  it("maps remaining categories to other", () => {
    const otherCategories: IngredientCategory[] = [
      "grain",
      "canned",
      "spice",
      "oil-vinegar",
      "condiment",
      "frozen",
      "other",
    ];
    for (const cat of otherCategories) {
      expect(INGREDIENT_TO_GROCERY_CATEGORY[cat]).toBe("other");
    }
  });
});

describe("GROCERY_CATEGORY_LABELS", () => {
  it("has labels for all display categories", () => {
    const expected: Record<GroceryDisplayCategory, string> = {
      protein: "Protein",
      produce: "Produce",
      dairy: "Dairy",
      snacks: "Snacks",
      other: "Other",
    };
    expect(GROCERY_CATEGORY_LABELS).toEqual(expected);
  });
});

describe("GROCERY_CATEGORY_ORDER", () => {
  it("contains all 5 display categories in the right order", () => {
    expect(GROCERY_CATEGORY_ORDER).toEqual([
      "protein",
      "produce",
      "dairy",
      "snacks",
      "other",
    ]);
  });
});
