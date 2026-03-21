import { createClient } from "./supabase/server";
import type { Recipe, ParsedRecipe } from "./types";

/** Convert Supabase row (snake_case) to Recipe (camelCase) */
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

/** Convert Recipe/ParsedRecipe (camelCase) to Supabase row (snake_case) */
function recipeToRow(recipe: ParsedRecipe & { sourceUrl?: string | null }) {
  return {
    title: recipe.title,
    source_url: recipe.sourceUrl ?? null,
    source_name: recipe.sourceName,
    description: recipe.description,
    cuisine: recipe.cuisine,
    meal_type: recipe.mealType,
    difficulty: recipe.difficulty,
    servings: recipe.servings,
    total_time_minutes: recipe.totalTimeMinutes,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    nutrition: recipe.nutrition,
    tags: recipe.tags,
    image_url: recipe.imageUrl,
    is_slow_cooker: recipe.isSlowCooker,
  };
}

export async function listRecipes(): Promise<Recipe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToRecipe);
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return rowToRecipe(data);
}

export async function createRecipe(
  recipe: ParsedRecipe & { sourceUrl?: string | null },
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert(recipeToRow(recipe))
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateRecipe(
  id: string,
  updates: Partial<ParsedRecipe & { sourceUrl?: string | null }>,
): Promise<void> {
  const supabase = await createClient();

  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.sourceUrl !== undefined) row.source_url = updates.sourceUrl;
  if (updates.sourceName !== undefined) row.source_name = updates.sourceName;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.cuisine !== undefined) row.cuisine = updates.cuisine;
  if (updates.mealType !== undefined) row.meal_type = updates.mealType;
  if (updates.difficulty !== undefined) row.difficulty = updates.difficulty;
  if (updates.servings !== undefined) row.servings = updates.servings;
  if (updates.totalTimeMinutes !== undefined) row.total_time_minutes = updates.totalTimeMinutes;
  if (updates.ingredients !== undefined) row.ingredients = updates.ingredients;
  if (updates.instructions !== undefined) row.instructions = updates.instructions;
  if (updates.nutrition !== undefined) row.nutrition = updates.nutrition;
  if (updates.tags !== undefined) row.tags = updates.tags;
  if (updates.imageUrl !== undefined) row.image_url = updates.imageUrl;
  if (updates.isSlowCooker !== undefined) row.is_slow_cooker = updates.isSlowCooker;

  const { error } = await supabase
    .from("recipes")
    .update(row)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteRecipe(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
}
