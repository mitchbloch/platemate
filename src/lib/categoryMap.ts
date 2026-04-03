import type { GroceryCategory, IngredientCategory } from "./types";

export const INGREDIENT_TO_GROCERY_CATEGORY: Record<IngredientCategory, string> = {
  meat: "Protein",
  seafood: "Protein",
  produce: "Produce",
  dairy: "Dairy",
  grain: "Pantry",
  canned: "Pantry",
  spice: "Pantry",
  "oil-vinegar": "Pantry",
  condiment: "Pantry",
  frozen: "Other",
  other: "Other",
};

export const GROCERY_CATEGORY_LABELS: Record<string, string> = {
  Protein: "Protein",
  Produce: "Produce",
  Dairy: "Dairy",
  Pantry: "Pantry",
  Other: "Other",
};

export const GROCERY_CATEGORY_ORDER: string[] = [
  "Protein",
  "Produce",
  "Dairy",
  "Pantry",
  "Other",
];

export const DEFAULT_GROCERY_CATEGORIES: GroceryCategory[] = [
  { name: "Protein", ingredientTypes: ["meat", "seafood"] },
  { name: "Produce", ingredientTypes: ["produce"] },
  { name: "Dairy", ingredientTypes: ["dairy"] },
  { name: "Pantry", ingredientTypes: ["grain", "canned", "spice", "oil-vinegar", "condiment"] },
  { name: "Other", ingredientTypes: ["frozen", "other"] },
];

export function getCategoryMap(categories: GroceryCategory[]): {
  categoryMap: Record<IngredientCategory, string>;
  categoryOrder: string[];
  categoryLabels: Record<string, string>;
} {
  const categoryMap: Record<string, string> = {};
  const categoryOrder: string[] = [];
  const categoryLabels: Record<string, string> = {};

  for (const cat of categories) {
    categoryOrder.push(cat.name);
    categoryLabels[cat.name] = cat.name;
    for (const ingredientType of cat.ingredientTypes) {
      categoryMap[ingredientType] = cat.name;
    }
  }

  const allIngredientCategories: IngredientCategory[] = [
    "produce", "meat", "seafood", "dairy", "grain",
    "canned", "spice", "oil-vinegar", "condiment", "frozen", "other",
  ];
  const fallback = categoryOrder[categoryOrder.length - 1] ?? "Other";
  for (const ic of allIngredientCategories) {
    if (!categoryMap[ic]) {
      categoryMap[ic] = fallback;
    }
  }

  return {
    categoryMap: categoryMap as Record<IngredientCategory, string>,
    categoryOrder,
    categoryLabels,
  };
}
