import { createClient } from "./supabase/server";
import { getActiveHouseholdId, getUser } from "./supabase/auth";
import { countUserTurns } from "./recipeGeneration";
import type { GenerationMessage, ParsedRecipe, RecipeGeneration } from "./types";

export class GenerationConflictError extends Error {
  constructor() {
    super("Someone else just added to this chat — reload to see it");
    this.name = "GenerationConflictError";
  }
}

export const GENERATION_TITLE_MAX = 80;

export function rowToGeneration(row: Record<string, unknown>): RecipeGeneration {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    createdBy: row.created_by as string,
    title: row.title as string,
    messages: (row.messages as GenerationMessage[]) ?? [],
    draft: (row.draft as ParsedRecipe | null) ?? null,
    status: row.status as RecipeGeneration["status"],
    savedRecipeId: (row.saved_recipe_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function titleFromMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > GENERATION_TITLE_MAX ? `${oneLine.slice(0, GENERATION_TITLE_MAX - 1)}…` : oneLine || "New recipe";
}

/** Active (unsaved) chats for the household, newest first. */
export async function listActiveGenerations(): Promise<RecipeGeneration[]> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("recipe_generations")
    .select("*")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToGeneration);
}

export async function getGeneration(id: string): Promise<RecipeGeneration | null> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("recipe_generations")
    .select("*")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToGeneration(data) : null;
}

/** The chat a saved recipe came from, if any ("How this was generated"). */
export async function getGenerationForRecipe(recipeId: string): Promise<RecipeGeneration | null> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("recipe_generations")
    .select("*")
    .eq("household_id", householdId)
    .eq("saved_recipe_id", recipeId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToGeneration(data) : null;
}

export async function createGeneration(firstMessage: string): Promise<RecipeGeneration> {
  const supabase = await createClient();
  const [householdId, user] = await Promise.all([getActiveHouseholdId(), getUser()]);
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("recipe_generations")
    .insert({ household_id: householdId, created_by: user.id, title: titleFromMessage(firstMessage), messages: [] })
    .select("*")
    .single();
  if (error) throw error;
  return rowToGeneration(data);
}

/** User turns across the household's chats touched in the last `hours`
 *  (the per-day spend cap counts every chat, not just the current one). */
export async function countHouseholdTurnsSince(hours: number): Promise<number> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("recipe_generations")
    .select("messages")
    .eq("household_id", householdId)
    .gte("updated_at", since);
  if (error) throw error;
  return (data ?? []).reduce((n, row) => n + countUserTurns((row.messages as GenerationMessage[]) ?? []), 0);
}

/** Append a completed turn (user + assistant) and refresh the draft.
 *  Optimistically locked on updated_at: if a partner appended to the same
 *  chat meanwhile, nothing is overwritten and the caller gets a conflict. */
export async function appendTurn(
  current: RecipeGeneration,
  turn: { user: GenerationMessage; assistant: GenerationMessage },
  draft: ParsedRecipe | null,
): Promise<RecipeGeneration> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_generations")
    .update({ messages: [...current.messages, turn.user, turn.assistant], draft: draft ?? current.draft })
    .eq("id", current.id)
    .eq("household_id", current.householdId)
    .eq("updated_at", current.updatedAt)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new GenerationConflictError();
  return rowToGeneration(data);
}

export async function markGenerationSaved(id: string, recipeId: string): Promise<void> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const { error } = await supabase
    .from("recipe_generations")
    .update({ status: "saved", saved_recipe_id: recipeId })
    .eq("id", id)
    .eq("household_id", householdId);
  if (error) throw error;
}

export async function deleteGeneration(id: string): Promise<void> {
  const supabase = await createClient();
  const householdId = await getActiveHouseholdId();
  const { error } = await supabase
    .from("recipe_generations")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);
  if (error) throw error;
}
