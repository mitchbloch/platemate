import type { GroceryDisplayCategory, IngredientCategory } from "./types";

export const INGREDIENT_TO_GROCERY_CATEGORY: Record<
  IngredientCategory,
  GroceryDisplayCategory
> = {
  meat: "protein",
  seafood: "protein",
  produce: "produce",
  dairy: "dairy",
  grain: "other",
  canned: "other",
  spice: "other",
  "oil-vinegar": "other",
  condiment: "other",
  frozen: "other",
  other: "other",
};

export const GROCERY_CATEGORY_LABELS: Record<GroceryDisplayCategory, string> = {
  protein: "Protein",
  produce: "Produce",
  dairy: "Dairy",
  snacks: "Snacks",
  other: "Other",
};

export const GROCERY_CATEGORY_ORDER: GroceryDisplayCategory[] = [
  "protein",
  "produce",
  "dairy",
  "snacks",
  "other",
];
