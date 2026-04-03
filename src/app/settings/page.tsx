"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import HouseholdSettings from "@/components/HouseholdSettings";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Household } from "@/lib/types";

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loadingHousehold, setLoadingHousehold] = useState(true);

  useEffect(() => {
    async function fetchHousehold() {
      if (!user) return;
      const supabase = createClient();

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("active_household_id")
        .eq("id", user.id)
        .single();

      if (profile?.active_household_id) {
        const { data: hh } = await supabase
          .from("households")
          .select("*")
          .eq("id", profile.active_household_id)
          .single();

        if (hh) {
          setHousehold({
            id: hh.id,
            name: hh.name,
            inviteCode: hh.invite_code,
            inviteCodeExpiresAt: hh.invite_code_expires_at,
            groceryStores: hh.grocery_stores,
            defaultStore: hh.default_store,
            mealSchedule: hh.meal_schedule,
            defaultServings: hh.default_servings,
            dietaryPreferences: hh.dietary_preferences,
            groceryCategories: hh.grocery_categories,
            nutritionPriorities: hh.nutrition_priorities,
            createdAt: hh.created_at,
            updatedAt: hh.updated_at,
          });
        }
      }
      setLoadingHousehold(false);
    }

    if (!loading) {
      fetchHousehold();
    }
  }, [user, loading]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-text">Settings</h1>

        {loading ? (
          <div className="h-20 animate-pulse rounded-2xl bg-border-light" />
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-warm">
              <h2 className="mb-2 text-sm font-medium text-text-muted">Account</h2>
              <p className="mb-4 text-text">{user?.email}</p>
              <button
                onClick={signOut}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-border-light hover:text-text"
              >
                Sign out
              </button>
            </div>

            {loadingHousehold ? (
              <div className="h-40 animate-pulse rounded-2xl bg-border-light" />
            ) : household && user ? (
              <HouseholdSettings household={household} currentUserId={user.id} />
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
