import { createClient } from "./supabase/server";
import type { UserProfile } from "./types";

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    displayName: row.display_name as string | null,
    onboardingCompleted: row.onboarding_completed as boolean,
    onboardingSkipped: row.onboarding_skipped as boolean,
    activeHouseholdId: row.active_household_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return null;
  return rowToProfile(data);
}

export async function createUserProfile(
  userId: string,
  profile: {
    displayName?: string;
    activeHouseholdId?: string;
  },
): Promise<UserProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .insert({
      id: userId,
      display_name: profile.displayName ?? null,
      active_household_id: profile.activeHouseholdId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToProfile(data);
}

export async function updateUserProfile(
  userId: string,
  updates: {
    displayName?: string;
    activeHouseholdId?: string;
    onboardingCompleted?: boolean;
    onboardingSkipped?: boolean;
  },
): Promise<void> {
  const supabase = await createClient();

  const row: Record<string, unknown> = {};
  if (updates.displayName !== undefined) row.display_name = updates.displayName;
  if (updates.activeHouseholdId !== undefined) row.active_household_id = updates.activeHouseholdId;
  if (updates.onboardingCompleted !== undefined) row.onboarding_completed = updates.onboardingCompleted;
  if (updates.onboardingSkipped !== undefined) row.onboarding_skipped = updates.onboardingSkipped;

  const { error } = await supabase
    .from("user_profiles")
    .update(row)
    .eq("id", userId);

  if (error) throw error;
}

export async function completeOnboarding(userId: string): Promise<void> {
  return updateUserProfile(userId, { onboardingCompleted: true });
}

export async function skipOnboarding(userId: string): Promise<void> {
  return updateUserProfile(userId, { onboardingSkipped: true });
}
