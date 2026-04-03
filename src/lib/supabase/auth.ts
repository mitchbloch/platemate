import { createClient } from "./server";
import { redirect } from "next/navigation";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/** Get the active household ID for the current user. Throws if not found. */
export async function getActiveHouseholdId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("active_household_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.active_household_id) {
    redirect("/signup?step=household");
  }

  return profile.active_household_id as string;
}
