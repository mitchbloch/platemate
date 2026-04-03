import { createClient } from "./supabase/server";
import type {
  Household,
  HouseholdMember,
  HouseholdInvite,
  MealSchedule,
  GroceryCategory,
  NutritionPriority,
  StoreName,
} from "./types";

/** Convert Supabase row to Household */
function rowToHousehold(row: Record<string, unknown>): Household {
  return {
    id: row.id as string,
    name: row.name as string,
    inviteCode: row.invite_code as string,
    inviteCodeExpiresAt: row.invite_code_expires_at as string | null,
    groceryStores: row.grocery_stores as StoreName[],
    defaultStore: row.default_store as StoreName,
    mealSchedule: row.meal_schedule as MealSchedule,
    defaultServings: row.default_servings as number,
    dietaryPreferences: row.dietary_preferences as string[],
    groceryCategories: row.grocery_categories as GroceryCategory[],
    nutritionPriorities: row.nutrition_priorities as NutritionPriority[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMember(row: Record<string, unknown>): HouseholdMember {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    userId: row.user_id as string,
    role: row.role as HouseholdMember["role"],
    displayName: (row.display_name as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function rowToInvite(row: Record<string, unknown>): HouseholdInvite {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    email: row.email as string,
    invitedBy: row.invited_by as string,
    status: row.status as HouseholdInvite["status"],
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
  };
}

// ── Household CRUD ──

export async function getHousehold(id: string): Promise<Household | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("households")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return rowToHousehold(data);
}

export async function createHousehold(name: string): Promise<Household> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("households")
    .insert({ name })
    .select("*")
    .single();

  if (error) throw error;
  return rowToHousehold(data);
}

export async function updateHouseholdPreferences(
  id: string,
  preferences: {
    name?: string;
    groceryStores?: StoreName[];
    defaultStore?: StoreName;
    mealSchedule?: MealSchedule;
    defaultServings?: number;
    dietaryPreferences?: string[];
    groceryCategories?: GroceryCategory[];
    nutritionPriorities?: NutritionPriority[];
  },
): Promise<void> {
  const supabase = await createClient();

  const row: Record<string, unknown> = {};
  if (preferences.name !== undefined) row.name = preferences.name;
  if (preferences.groceryStores !== undefined) row.grocery_stores = preferences.groceryStores;
  if (preferences.defaultStore !== undefined) row.default_store = preferences.defaultStore;
  if (preferences.mealSchedule !== undefined) row.meal_schedule = preferences.mealSchedule;
  if (preferences.defaultServings !== undefined) row.default_servings = preferences.defaultServings;
  if (preferences.dietaryPreferences !== undefined) row.dietary_preferences = preferences.dietaryPreferences;
  if (preferences.groceryCategories !== undefined) row.grocery_categories = preferences.groceryCategories;
  if (preferences.nutritionPriorities !== undefined) row.nutrition_priorities = preferences.nutritionPriorities;

  const { error } = await supabase
    .from("households")
    .update(row)
    .eq("id", id);

  if (error) throw error;
}

// ── Invite Codes ──

export async function getHouseholdByInviteCode(code: string): Promise<Household | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("households")
    .select("*")
    .eq("invite_code", code)
    .single();

  if (error) return null;

  // Check expiration
  if (data.invite_code_expires_at && new Date(data.invite_code_expires_at) < new Date()) {
    return null;
  }

  return rowToHousehold(data);
}

export async function regenerateInviteCode(householdId: string): Promise<string> {
  const supabase = await createClient();
  // Generate new code via SQL (encode(gen_random_bytes(6), 'hex'))
  const { data, error } = await supabase.rpc("regenerate_invite_code", {
    household_id_input: householdId,
  });

  if (error) {
    // Fallback: generate client-side
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error: updateError } = await supabase
      .from("households")
      .update({ invite_code: code })
      .eq("id", householdId);

    if (updateError) throw updateError;
    return code;
  }

  return data as string;
}

// ── Members ──

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("*, user_profiles(display_name)")
    .eq("household_id", householdId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = row.user_profiles as Record<string, unknown> | null;
    return rowToMember({
      ...row,
      display_name: profile?.display_name ?? null,
    });
  });
}

export async function addHouseholdMember(
  householdId: string,
  userId: string,
  role: "admin" | "member" = "member",
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("household_members")
    .insert({ household_id: householdId, user_id: userId, role });

  if (error) throw error;
}

export async function updateMemberRole(
  householdId: string,
  userId: string,
  role: "admin" | "member",
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("household_members")
    .update({ role })
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) throw error;
}

// ── Email Invites ──

export async function createEmailInvite(
  householdId: string,
  email: string,
  invitedBy: string,
): Promise<HouseholdInvite> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_invites")
    .insert({
      household_id: householdId,
      email,
      invited_by: invitedBy,
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToInvite(data);
}

export async function getInvitesForHousehold(householdId: string): Promise<HouseholdInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_invites")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToInvite);
}

export async function acceptInvite(inviteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("household_invites")
    .update({ status: "accepted" })
    .eq("id", inviteId);

  if (error) throw error;
}
