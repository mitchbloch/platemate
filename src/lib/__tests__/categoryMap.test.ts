import { describe, it, expect } from "vitest";
import {
  INGREDIENT_TO_GROCERY_CATEGORY,
  GROCERY_CATEGORY_LABELS,
  GROCERY_CATEGORY_ORDER,
  DEFAULT_GROCERY_CATEGORIES,
  getCategoryMap,
} from "../categoryMap";
import type { IngredientCategory } from "../types";

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

  it("maps meat and seafood to Protein", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["meat"]).toBe("Protein");
    expect(INGREDIENT_TO_GROCERY_CATEGORY["seafood"]).toBe("Protein");
  });

  it("maps produce to Produce", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["produce"]).toBe("Produce");
  });

  it("maps dairy to Dairy", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["dairy"]).toBe("Dairy");
  });

  it("maps pantry categories to Pantry", () => {
    const pantryCategories: IngredientCategory[] = [
      "grain",
      "canned",
      "spice",
      "oil-vinegar",
      "condiment",
    ];
    for (const cat of pantryCategories) {
      expect(INGREDIENT_TO_GROCERY_CATEGORY[cat]).toBe("Pantry");
    }
  });

  it("maps frozen and other to Other", () => {
    expect(INGREDIENT_TO_GROCERY_CATEGORY["frozen"]).toBe("Other");
    expect(INGREDIENT_TO_GROCERY_CATEGORY["other"]).toBe("Other");
  });
});

describe("GROCERY_CATEGORY_LABELS", () => {
  it("has labels for all display categories", () => {
    const expected: Record<string, string> = {
      Protein: "Protein",
      Produce: "Produce",
      Dairy: "Dairy",
      Pantry: "Pantry",
      Other: "Other",
    };
    expect(GROCERY_CATEGORY_LABELS).toEqual(expected);
  });
});

describe("GROCERY_CATEGORY_ORDER", () => {
  it("contains all 5 display categories in the right order", () => {
    expect(GROCERY_CATEGORY_ORDER).toEqual([
      "Protein",
      "Produce",
      "Dairy",
      "Pantry",
      "Other",
    ]);
  });
});

describe("getCategoryMap", () => {
  it("builds a map from default categories", () => {
    const { categoryMap, categoryOrder, categoryLabels } = getCategoryMap(DEFAULT_GROCERY_CATEGORIES);

    expect(categoryMap["meat"]).toBe("Protein");
    expect(categoryMap["seafood"]).toBe("Protein");
    expect(categoryMap["produce"]).toBe("Produce");
    expect(categoryMap["dairy"]).toBe("Dairy");
    expect(categoryMap["grain"]).toBe("Pantry");
    expect(categoryMap["frozen"]).toBe("Other");

    expect(categoryOrder).toEqual(["Protein", "Produce", "Dairy", "Pantry", "Other"]);
    expect(categoryLabels["Protein"]).toBe("Protein");
  });

  it("fills in missing ingredient categories with fallback", () => {
    const custom = [
      { name: "Fresh", ingredientTypes: ["produce" as IngredientCategory] },
    ];
    const { categoryMap } = getCategoryMap(custom);

    expect(categoryMap["produce"]).toBe("Fresh");
    // All others should fall back to the last category
    expect(categoryMap["meat"]).toBe("Fresh");
    expect(categoryMap["dairy"]).toBe("Fresh");
  });
});
