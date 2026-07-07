import { createClient } from "./supabase/server";
import { getActiveHouseholdId } from "./supabase/auth";
import type { MealPlan, MealPlanRecipe, Recipe, MealType } from "./types";

// ── Row Converters ──

function rowToMealPlan(row: Record<string, unknown>): MealPlan {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    weekStart: row.week_start as string,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMealPlanRecipe(row: Record<string, unknown>): MealPlanRecipe {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
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
    householdId: row.household_id as string,
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
    dietaryFlags: (row.dietary_flags as Recipe["dietaryFlags"]) ?? [],
    tags: row.tags as string[],
    imageUrl: row.image_url as string | null,
    isSlowCooker: row.is_slow_cooker as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── Helpers ──

/** The timezone weeks roll over in. Server code runs in UTC on Vercel, so
 *  using the ambient timezone would advance the week at 8pm Eastern. */
const APP_TIME_ZONE = "America/New_York";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Returns the Sunday of the given date's week as an ISO date string (YYYY-MM-DD) */
export function getWeekStart(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  const dayIndex = WEEKDAYS.indexOf(get("weekday"));
  // Subtract in UTC so DST transitions can't shift the calendar date
  const utcMidnight = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  const sunday = new Date(utcMidnight - dayIndex * 86_400_000);
  return sunday.toISOString().slice(0, 10);
}

// ── Meal Plan CRUD ──

export async function getMealPlanByWeek(weekStart: string): Promise<MealPlan | null> {
  const supabase = await createClient();
  // Scope by active household — RLS alone returns rows from every household
  // the user belongs to, which breaks for multi-household members.
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error || !data) return null;
  return rowToMealPlan(data);
}

export async function createMealPlan(weekStart: string, notes?: string): Promise<string> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("meal_plans")
    .insert({ week_start: weekStart, notes: notes ?? null, household_id: householdId })
    .select("id")
    .single();

  if (error) {
    // Unique violation: another household member created this week's plan
    // concurrently — use theirs.
    if ((error as { code?: string }).code === "23505") {
      const existing = await getMealPlanByWeek(weekStart);
      if (existing) return existing.id;
    }
    throw error;
  }
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
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("meal_plan_recipes")
    .insert({
      household_id: householdId,
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
