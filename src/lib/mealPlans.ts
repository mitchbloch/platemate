import { createClient } from "./supabase/server";
import type { MealPlan, MealPlanRecipe, Recipe, MealType } from "./types";

// ── Row Converters ──

function rowToMealPlan(row: Record<string, unknown>): MealPlan {
  return {
    id: row.id as string,
    weekStart: row.week_start as string,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMealPlanRecipe(row: Record<string, unknown>): MealPlanRecipe {
  return {
    id: row.id as string,
    mealPlanId: row.meal_plan_id as string,
    recipeId: row.recipe_id as string,
    dayOfWeek: row.day_of_week as number,
    mealType: row.meal_type as MealType,
    servingsOverride: row.servings_override as number | null,
  };
}

function rowToRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: row.id as string,
    title: row.title as string,
    sourceUrl: row.source_url as string | null,
    sourceName: row.source_name as string | null,
    description: row.description as string | null,
    cuisine: row.cuisine as Recipe["cuisine"],
    mealType: row.meal_type as Recipe["mealType"],
    difficulty: row.difficulty as Recipe["difficulty"],
    servings: row.servings as number,
    totalTimeMinutes: row.total_time_minutes as number | null,
    ingredients: row.ingredients as Recipe["ingredients"],
    instructions: row.instructions as string[],
    nutrition: row.nutrition as Recipe["nutrition"],
    tags: row.tags as string[],
    imageUrl: row.image_url as string | null,
    isSlowCooker: row.is_slow_cooker as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── Helpers ──

/** Returns the Sunday of the given date's week as an ISO date string (YYYY-MM-DD) */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday offset (getDay() 0=Sun)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Meal Plan CRUD ──

export async function getMealPlanByWeek(weekStart: string): Promise<MealPlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("week_start", weekStart)
    .single();

  if (error) return null;
  return rowToMealPlan(data);
}

export async function createMealPlan(weekStart: string, notes?: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plans")
    .insert({ week_start: weekStart, notes: notes ?? null })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Get a meal plan with all its recipes joined. Returns null plan + empty meals if no plan exists. */
export async function getMealPlanWithRecipes(weekStart: string): Promise<{
  plan: MealPlan | null;
  meals: Array<MealPlanRecipe & { recipe: Recipe }>;
}> {
  const plan = await getMealPlanByWeek(weekStart);
  if (!plan) return { plan: null, meals: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plan_recipes")
    .select("*, recipe:recipes(*)")
    .eq("meal_plan_id", plan.id);

  if (error) throw error;

  const meals = (data ?? []).map((row) => {
    const recipeRow = row.recipe as Record<string, unknown>;
    return {
      ...rowToMealPlanRecipe(row),
      recipe: rowToRecipe(recipeRow),
    };
  });

  return { plan, meals };
}

/** Get just the recipe IDs in a plan (lightweight check for completion detection) */
export async function getMealPlanRecipeIds(mealPlanId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plan_recipes")
    .select("recipe_id")
    .eq("meal_plan_id", mealPlanId);

  if (error) throw error;
  return (data ?? []).map((row) => row.recipe_id);
}

export async function addRecipeToMealPlan(
  mealPlanId: string,
  recipeId: string,
  mealType: MealType,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plan_recipes")
    .insert({
      meal_plan_id: mealPlanId,
      recipe_id: recipeId,
      day_of_week: 0, // unassigned — Phase 3 uses unordered sets
      meal_type: mealType,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function removeRecipeFromMealPlan(mealPlanRecipeId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_recipes")
    .delete()
    .eq("id", mealPlanRecipeId);

  if (error) throw error;
}
