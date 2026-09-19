import { randomBytes } from "node:crypto";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { createAnonClient } from "./supabase/anon";
import { getUser } from "./supabase/auth";
import type { RecipeShare, SharedRecipe } from "./types";
import { isValidShareToken } from "./sharePaths";

export { sharePath, isValidShareToken } from "./sharePaths";

// ── Row converters ──

export function rowToRecipeShare(row: Record<string, unknown>): RecipeShare {
  return {
    id: row.id as string,
    recipeId: row.recipe_id as string,
    token: row.token as string,
    viewCount: (row.view_count as number) ?? 0,
    saveCount: (row.save_count as number) ?? 0,
    revokedAt: (row.revoked_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

/** 128 bits of randomness, URL-safe, 22 chars. */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}



// ── Sharer side (authenticated, household-scoped by RLS) ──

/** The caller's active share for a recipe, if any. */
export async function getActiveShare(recipeId: string): Promise<RecipeShare | null> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("recipe_shares")
    .select("*")
    .eq("recipe_id", recipeId)
    .eq("created_by", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRecipeShare(data) : null;
}

/** Reuse the caller's active share or mint one — the link stays stable.
 *  The share belongs to the RECIPE's household (not the caller's active
 *  one) so the owning household can always see and revoke it. */
export async function getOrCreateShare(recipe: { id: string; householdId: string }): Promise<RecipeShare> {
  const existing = await getActiveShare(recipe.id);
  if (existing) return existing;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("recipe_shares")
    .insert({
      recipe_id: recipe.id,
      household_id: recipe.householdId,
      created_by: user.id,
      token: newShareToken(),
    })
    .select("*")
    .single();

  if (error) {
    // Unique violation: a concurrent share from the same user won — use it
    if ((error as { code?: string }).code === "23505") {
      const again = await getActiveShare(recipe.id);
      if (again) return again;
    }
    throw error;
  }
  return rowToRecipeShare(data);
}

export async function revokeShare(shareId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipe_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .is("revoked_at", null);
  if (error) throw error;
}

// ── Public side ──

/** Resolve a share token to its recipe (and count the view). Memoized per
 *  request so generateMetadata and the page share one call — and one view. */
export const getSharedRecipe = cache(async (token: string): Promise<SharedRecipe | null> => {
  if (!isValidShareToken(token)) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_shared_recipe", { token_input: token });
  if (error) throw error;
  if (!data) return null;
  return data as SharedRecipe;
});

/** Copy the shared recipe into the caller's active household, atomically
 *  with the save count. `existing` means the household already had it. */
export async function saveSharedRecipe(token: string): Promise<{ recipeId: string; existing: boolean }> {
  if (!isValidShareToken(token)) throw new Error("This link is no longer active");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_shared_recipe", { token_input: token });
  if (error) throw new Error(error.message);
  return data as { recipeId: string; existing: boolean };
}
