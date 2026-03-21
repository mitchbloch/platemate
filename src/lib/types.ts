// ── Domain Types ──

export type CuisineType =
  | "american"
  | "italian"
  | "mexican"
  | "asian"
  | "mediterranean"
  | "indian"
  | "middle-eastern"
  | "french"
  | "other";

export type MealType = "dinner" | "slow-cooker-lunch";

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface NutritionInfo {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  saturatedFat: number; // grams
  cholesterol: number; // mg
  fiber: number; // grams
  sodium: number; // mg
}

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  preparation: string | null; // e.g. "diced", "minced"
  category: IngredientCategory;
  raw: string; // original text from recipe
}

export type IngredientCategory =
  | "produce"
  | "meat"
  | "seafood"
  | "dairy"
  | "grain"
  | "canned"
  | "spice"
  | "oil-vinegar"
  | "condiment"
  | "frozen"
  | "other";

export interface Recipe {
  id: string;
  title: string;
  sourceUrl: string | null;
  sourceName: string | null; // "NYT Cooking", "Stealth Health", etc.
  description: string | null;
  cuisine: CuisineType;
  mealType: MealType;
  difficulty: DifficultyLevel;
  servings: number;
  totalTimeMinutes: number | null;
  ingredients: Ingredient[];
  instructions: string[];
  nutrition: NutritionInfo | null;
  tags: string[];
  imageUrl: string | null;
  isSlowCooker: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlan {
  id: string;
  weekStart: string; // ISO date string, always a Monday
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanRecipe {
  id: string;
  mealPlanId: string;
  recipeId: string;
  dayOfWeek: number; // 0=Monday ... 6=Sunday
  mealType: MealType;
  servingsOverride: number | null;
}

export interface GroceryList {
  id: string;
  mealPlanId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryListItem {
  id: string;
  groceryListId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  store: StoreName;
  checked: boolean;
  recipeIds: string[]; // which recipes need this item
}

export type StoreName = "trader-joes" | "whole-foods" | "hmart" | "target" | "other";

export interface RecipeHistory {
  id: string;
  recipeId: string;
  cookedAt: string;
  rating: number | null; // 1-5
  notes: string | null;
}

// ── AI / Parser Types ──

export interface ParsedRecipe {
  title: string;
  description: string | null;
  cuisine: CuisineType;
  mealType: MealType;
  difficulty: DifficultyLevel;
  servings: number;
  totalTimeMinutes: number | null;
  ingredients: Ingredient[];
  instructions: string[];
  nutrition: NutritionInfo;
  tags: string[];
  imageUrl: string | null;
  isSlowCooker: boolean;
  sourceName: string | null;
}

// ── Nutrition Thresholds ──

/** Per-serving thresholds for health flags */
export const NUTRITION_THRESHOLDS = {
  cholesterol: {
    warning: 60, // mg — flag as "moderate"
    danger: 100, // mg — flag as "high"
  },
  saturatedFat: {
    warning: 5, // g
    danger: 8, // g
  },
  sodium: {
    warning: 600, // mg
    danger: 900, // mg
  },
} as const;

/** Daily recommended limits (American Heart Association) */
export const DAILY_LIMITS = {
  cholesterol: 300, // mg
  saturatedFat: 13, // g (for 2000 cal diet)
  sodium: 2300, // mg
} as const;

// ── UI Constants ──

export const CUISINE_LABELS: Record<CuisineType, string> = {
  american: "American",
  italian: "Italian",
  mexican: "Mexican",
  asian: "Asian",
  mediterranean: "Mediterranean",
  indian: "Indian",
  "middle-eastern": "Middle Eastern",
  french: "French",
  other: "Other",
};

export const STORE_LABELS: Record<StoreName, string> = {
  "trader-joes": "Trader Joe's",
  "whole-foods": "Whole Foods",
  hmart: "H Mart",
  target: "Target",
  other: "Other",
};

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: "Produce",
  meat: "Meat & Poultry",
  seafood: "Seafood",
  dairy: "Dairy & Eggs",
  grain: "Grains & Bread",
  canned: "Canned & Jarred",
  spice: "Spices & Herbs",
  "oil-vinegar": "Oils & Vinegars",
  condiment: "Condiments & Sauces",
  frozen: "Frozen",
  other: "Other",
};
