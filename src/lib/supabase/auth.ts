import { cache } from "react";
import { createClient } from "./server";
import { redirect } from "next/navigation";

// Both helpers are memoized per request with React cache(): a page render
// used to call getActiveHouseholdId() once per DAL call (4–5× on /plan),
// each hitting the auth server and the profile table again.
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

/** Get the active household ID for the current user. Throws if not found. */
export const getActiveHouseholdId = cache(async (): Promise<string> => {
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
});
