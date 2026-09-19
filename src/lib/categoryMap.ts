import type { GroceryCategory, GroceryDisplayCategory, IngredientCategory } from "./types";

export const INGREDIENT_TO_GROCERY_CATEGORY: Record<IngredientCategory, GroceryDisplayCategory> = {
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

export const GROCERY_CATEGORY_LABELS: Record<GroceryDisplayCategory, string> = {
  Protein: "Protein",
  Produce: "Produce",
  Dairy: "Dairy",
  Pantry: "Pantry",
  Other: "Other",
};

export const GROCERY_CATEGORY_ORDER: GroceryDisplayCategory[] = [
  "Protein",
  "Produce",
  "Dairy",
  "Pantry",
  "Other",
];

/** Canonical section for any casing ("produce", "PRODUCE" → "Produce"), or
 *  null when the value isn't a section at all. Older pinned rows and API
 *  callers used mixed casing; the DAL normalizes through this. */
export function toGroceryDisplayCategory(value: string): GroceryDisplayCategory | null {
  const lower = value.trim().toLowerCase();
  return GROCERY_CATEGORY_ORDER.find((c) => c.toLowerCase() === lower) ?? null;
}

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
