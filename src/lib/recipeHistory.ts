import { createClient } from "./supabase/server";
import { getActiveHouseholdId } from "./supabase/auth";
import type { RecipeHistory } from "./types";

function rowToRecipeHistory(row: Record<string, unknown>): RecipeHistory {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    recipeId: row.recipe_id as string,
    cookedAt: row.cooked_at as string,
    rating: row.rating as number | null,
    notes: row.notes as string | null,
  };
}

/** Batch-insert cooked recipes. Skips any already logged for the same recipe+date. Returns count logged. */
export async function logCookedRecipes(
  entries: Array<{ recipeId: string; cookedAt: string }>,
): Promise<number> {
  if (entries.length === 0) return 0;

  const supabase = await createClient();

  // Check for existing entries to avoid duplicates
  const { data: existing } = await supabase
    .from("recipe_history")
    .select("recipe_id, cooked_at")
    .in("recipe_id", entries.map((e) => e.recipeId))
    .in("cooked_at", [...new Set(entries.map((e) => e.cookedAt))]);

  const existingSet = new Set(
    (existing ?? []).map((r) => `${r.recipe_id}:${r.cooked_at}`),
  );

  const newEntries = entries.filter(
    (e) => !existingSet.has(`${e.recipeId}:${e.cookedAt}`),
  );

  if (newEntries.length === 0) return 0;

  const householdId = await getActiveHouseholdId();
  const { error } = await supabase.from("recipe_history").insert(
    newEntries.map((e) => ({
      household_id: householdId,
      recipe_id: e.recipeId,
      cooked_at: e.cookedAt,
    })),
  );

  if (error) throw error;
  return newEntries.length;
}

/** Get the most recent cooked_at date for each recipe. Returns recipeId → ISO date map. */
export async function getLastCookedDates(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_history")
    .select("recipe_id, cooked_at")
    .order("cooked_at", { ascending: false });

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    // First occurrence per recipe_id is the most recent (ordered desc)
    if (!map[row.recipe_id]) {
      map[row.recipe_id] = row.cooked_at;
    }
  }
  return map;
}

/** Check if any history entries exist for a given week (by cooked_at date). */
export async function hasHistoryForWeek(weekStart: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("recipe_history")
    .select("id", { count: "exact", head: true })
    .eq("cooked_at", weekStart);

  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Get all history entries for a specific recipe, most recent first. */
export async function getRecipeHistory(recipeId: string): Promise<RecipeHistory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_history")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("cooked_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToRecipeHistory);
}
