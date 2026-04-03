"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense, useEffect } from "react";
import Link from "next/link";

type Step = "account" | "household" | "preferences";

const STORE_OPTIONS = [
  { value: "trader-joes", label: "Trader Joe's" },
  { value: "whole-foods", label: "Whole Foods" },
  { value: "target", label: "Target" },
  { value: "costco", label: "Costco" },
  { value: "other", label: "Other" },
];

// Absolute restrictions — allergy, ethics, religion
const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten-free", label: "Gluten-free" },
  { value: "dairy-free", label: "Dairy-free" },
  { value: "nut-free", label: "Nut-free" },
  { value: "shellfish-free", label: "Shellfish-free" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
];

// All nutrients tracked by Platemate — no custom additions since these map to parsed recipe data
const NUTRITION_OPTIONS = [
  { value: "calories", label: "Calories" },
  { value: "protein", label: "Protein" },
  { value: "carbs", label: "Carbs" },
  { value: "fat", label: "Fat" },
  { value: "saturatedFat", label: "Saturated fat" },
  { value: "cholesterol", label: "Cholesterol" },
  { value: "fiber", label: "Fiber" },
  { value: "sodium", label: "Sodium" },
];

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function PillGroup({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(toggle(selected, opt.value))}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-text-secondary hover:border-primary hover:text-primary"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CustomPillInput({
  selected,
  onChange,
  placeholder,
  knownValues,
}: {
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
  // Values covered by the preset pills above — custom pills only show extras
  knownValues: string[];
}) {
  const [input, setInput] = useState("");

  const customSelected = selected.filter((v) => !knownValues.includes(v));

  function add() {
    const val = input.trim().toLowerCase();
    if (!val || selected.includes(val)) return;
    onChange([...selected, val]);
    setInput("");
  }

  return (
    <div className="space-y-2">
      {customSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customSelected.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => onChange(selected.filter((v) => v !== val))}
              className="flex items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1 text-sm font-medium text-white"
            >
              {val}
              <span className="text-xs opacity-70">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = searchParams.get("step") === "household" ? "household" : "account";

  const [step, setStep] = useState<Step>(initialStep);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Household step
  const [householdMode, setHouseholdMode] = useState<"create" | "join">("create");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [householdId, setHouseholdId] = useState<string | null>(null);

  // Preferences step
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [selectedNutrients, setSelectedNutrients] = useState<string[]>([]);

  // On mount: if already authenticated, skip to household step or home
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setChecking(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("active_household_id, display_name")
        .eq("id", user.id)
        .single();

      if (profile?.active_household_id) {
        router.replace("/");
        return;
      }

      if (profile?.display_name) setDisplayName(profile.display_name);
      setStep("household");
      setChecking(false);
    }
    checkAuth();
  }, [router]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/signup?step=household')}`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Account created! Please check your email to confirm, then sign in.");
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("household");
  }

  async function handleHousehold(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (householdMode === "create") {
        const res = await fetch("/api/households", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: householdName, displayName: displayName.trim() || undefined }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to create household");
        }
        const data = await res.json();
        setHouseholdId(data.household?.id ?? null);
        setLoading(false);
        setStep("preferences");
      } else {
        const res = await fetch("/api/households/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteCode, displayName: displayName.trim() || undefined }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to join household");
        }
        // Joining an existing household — skip preferences, go straight to app
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function handlePreferences(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId) {
      router.push("/");
      return;
    }

    setLoading(true);
    try {
      await fetch(`/api/households/${householdId}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groceryStores: selectedStores.length > 0 ? selectedStores : undefined,
          defaultStore: selectedStores[0] ?? undefined,
          dietaryPreferences: selectedDietary,
          nutritionPriorities: NUTRITION_OPTIONS
            .filter((n) => selectedNutrients.includes(n.value))
            .map((n, i) => ({ nutrient: n.value, rank: i + 1 })),
        }),
      });
    } catch {
      // Best-effort — preferences can be configured in Settings later
    }

    router.push("/");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in-up">
        <h1 className="mb-2 text-center font-display text-3xl font-semibold tracking-tight text-text">
          Platemate
        </h1>

        {step === "account" && (
          <>
            <p className="mb-8 text-center text-text-secondary">Create your account</p>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-secondary">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-secondary">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {loading ? "Creating account..." : "Continue"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:text-primary-dark">
                Sign in
              </Link>
            </p>
          </>
        )}

        {step === "household" && (
          <>
            <p className="mb-6 text-center text-text-secondary">Set up your household</p>

            <div className="mb-6 flex rounded-lg border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => { setHouseholdMode("create"); setError(null); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  householdMode === "create"
                    ? "bg-primary text-white shadow-warm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => { setHouseholdMode("join"); setError(null); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  householdMode === "join"
                    ? "bg-primary text-white shadow-warm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Join existing
              </button>
            </div>

            <form onSubmit={handleHousehold} className="space-y-4">
              <div>
                <label htmlFor="display-name" className="mb-1 block text-sm font-medium text-text-secondary">
                  Your name
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="First name or nickname"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
              </div>

              {householdMode === "create" ? (
                <div>
                  <label htmlFor="household-name" className="mb-1 block text-sm font-medium text-text-secondary">
                    Household name
                  </label>
                  <input
                    id="household-name"
                    type="text"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    required
                    placeholder="e.g. The Smiths"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="invite-code" className="mb-1 block text-sm font-medium text-text-secondary">
                    Invite code
                  </label>
                  <input
                    id="invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                    placeholder="Paste the code you received"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                  />
                </div>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {loading
                  ? householdMode === "create" ? "Creating..." : "Joining..."
                  : householdMode === "create" ? "Create household" : "Join household"}
              </button>
            </form>
          </>
        )}

        {step === "preferences" && (
          <>
            <p className="mb-2 text-center text-text-secondary">Customize your household</p>
            <p className="mb-8 text-center text-sm text-text-muted">
              You can always update these in Settings.
            </p>

            <form onSubmit={handlePreferences} className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-text-secondary">Where do you shop?</p>
                <PillGroup
                  options={STORE_OPTIONS}
                  selected={selectedStores}
                  onChange={setSelectedStores}
                />
                <div className="mt-2">
                  <CustomPillInput
                    selected={selectedStores}
                    onChange={setSelectedStores}
                    placeholder="Add another store…"
                    knownValues={STORE_OPTIONS.map((s) => s.value)}
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-text-secondary">Any dietary preferences?</p>
                <PillGroup
                  options={DIETARY_OPTIONS}
                  selected={selectedDietary}
                  onChange={setSelectedDietary}
                />
                <div className="mt-2">
                  <CustomPillInput
                    selected={selectedDietary}
                    onChange={setSelectedDietary}
                    placeholder="Add another preference…"
                    knownValues={DIETARY_OPTIONS.map((d) => d.value)}
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-text-secondary">Which nutrients do you want to track?</p>
                <PillGroup
                  options={NUTRITION_OPTIONS}
                  selected={selectedNutrients}
                  onChange={setSelectedNutrients}
                />
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Get started →"}
                </button>
                <button
                  type="button"
                  onClick={() => { router.push("/"); router.refresh(); }}
                  className="w-full py-2 text-sm font-medium text-text-muted transition-colors hover:text-text-secondary"
                >
                  Skip for now
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
