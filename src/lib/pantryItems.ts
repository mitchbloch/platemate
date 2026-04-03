import { createClient } from "./supabase/server";
import { getActiveHouseholdId } from "./supabase/auth";
import type { PantryItem } from "./types";

// ── Row Converters ──

function rowToPantryItem(row: Record<string, unknown>): PantryItem {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
  };
}

// ── CRUD ──

export async function getPantryItems(): Promise<PantryItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pantry_items")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data ?? []).map(rowToPantryItem);
}

export async function addPantryItem(name: string): Promise<PantryItem> {
  const supabase = await createClient();

  const normalized = name.toLowerCase().trim();

  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("pantry_items")
    .upsert({ name: normalized, household_id: householdId }, { onConflict: "household_id,name" })
    .select()
    .single();

  if (error) throw error;
  return rowToPantryItem(data);
}

export async function removePantryItem(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
