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

export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

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
  householdId: string;
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
  dietaryFlags: DietaryFlag[];
  tags: string[];
  imageUrl: string | null;
  isSlowCooker: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlan {
  id: string;
  householdId: string;
  weekStart: string; // ISO date string, always a Sunday
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanRecipe {
  id: string;
  householdId: string;
  mealPlanId: string;
  recipeId: string;
  dayOfWeek: number; // 0=Monday ... 6=Sunday
  mealType: MealType;
  servingsOverride: number | null;
}

export type GroceryListStatus = "edit" | "shop" | "completed";

export interface GroceryList {
  id: string;
  householdId: string;
  weekStart: string;
  mealPlanId: string | null;
  status: GroceryListStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryListItem {
  id: string;
  householdId: string;
  groceryListId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  store: StoreName;
  checked: boolean;
  dismissed: boolean;
  recipeIds: string[]; // which recipes need this item
  isManual: boolean;
  sortOrder: number;
}

export type StoreName = "trader-joes" | "whole-foods" | "hmart" | "target" | "other";

export type GroceryDisplayCategory = "protein" | "produce" | "dairy" | "snacks" | "other";

export interface MergedIngredient {
  name: string; // normalized name (lowercase, trimmed)
  displayName: string; // human-readable name for UI
  quantity: number | null;
  unit: string | null;
  category: string;
  store: StoreName;
  recipeIds: string[]; // which recipes need this item
}

export interface PinnedGroceryItem {
  id: string;
  householdId: string;
  name: string;
  category: GroceryDisplayCategory;
  store: StoreName;
  quantity: number | null;
  unit: string | null;
  createdAt: string;
}

export interface PantryItem {
  id: string;
  householdId: string;
  name: string;
  createdAt: string;
}

// ── Household Types ──

export interface MealSchedule {
  breakfast: number;
  lunch: number;
  dinner: number;
  snacks: number;
}

export interface GroceryCategory {
  name: string;
  ingredientTypes: IngredientCategory[];
}

export interface NutritionPriority {
  nutrient: keyof NutritionInfo;
  rank: number;
}

export type HouseholdRole = "admin" | "member";

export type InviteStatus = "pending" | "accepted" | "expired";

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  inviteCodeExpiresAt: string | null;
  groceryStores: string[];
  defaultStore: string;
  mealSchedule: MealSchedule;
  defaultServings: number;
  dietaryPreferences: string[];
  groceryCategories: GroceryCategory[];
  nutritionPriorities: NutritionPriority[];
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  role: HouseholdRole;
  displayName: string | null;
  createdAt: string;
}

export interface HouseholdInvite {
  id: string;
  householdId: string;
  email: string;
  invitedBy: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;
  activeHouseholdId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryListWithItems {
  list: GroceryList;
  items: GroceryListItem[];
}

export interface RecipeHistory {
  id: string;
  householdId: string;
  recipeId: string;
  cookedAt: string;
  rating: number | null; // 1-5
  notes: string | null;
}

// ── Dietary Types ──

export type DietaryFlag =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "dairy-free"
  | "nut-free"
  | "shellfish-free"
  | "low-sodium"
  | "low-cholesterol";

export const DIETARY_FLAG_LABELS: Record<DietaryFlag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-Free",
  "dairy-free": "Dairy-Free",
  "nut-free": "Nut-Free",
  "shellfish-free": "Shellfish-Free",
  "low-sodium": "Low Sodium",
  "low-cholesterol": "Low Cholesterol",
};

export interface DietaryWarning {
  preference: string;
  message: string;
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
  dietaryFlags: DietaryFlag[];
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

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

export const NUTRITION_LABELS: Record<keyof NutritionInfo, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  saturatedFat: "Saturated Fat",
  cholesterol: "Cholesterol",
  fiber: "Fiber",
  sodium: "Sodium",
};

export const NUTRITION_UNITS: Record<keyof NutritionInfo, string> = {
  calories: "kcal",
  protein: "g",
  carbs: "g",
  fat: "g",
  saturatedFat: "g",
  cholesterol: "mg",
  fiber: "g",
  sodium: "mg",
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
