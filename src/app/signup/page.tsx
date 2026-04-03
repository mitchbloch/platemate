"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";

type Step = "account" | "household";

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

  // Household step state
  const [householdMode, setHouseholdMode] = useState<"create" | "join">("create");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Auto-sign in after signup
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <h1 className="mb-2 text-center font-display text-3xl font-semibold tracking-tight text-text">
          Platemate
        </h1>

        {step === "account" ? (
          <>
            <p className="mb-8 text-center text-text-secondary">
              Create your account
            </p>

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Your name
                </label>
                <input
                  id="name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="First name or nickname"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
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
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
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
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:text-primary-dark">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mb-6 text-center text-text-secondary">
              Set up your household
            </p>

            {/* Mode toggle */}
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
              {householdMode === "create" ? (
                <div>
                  <label
                    htmlFor="household-name"
                    className="mb-1 block text-sm font-medium text-text-secondary"
                  >
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
                  <label
                    htmlFor="invite-code"
                    className="mb-1 block text-sm font-medium text-text-secondary"
                  >
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
                  ? householdMode === "create"
                    ? "Creating..."
                    : "Joining..."
                  : householdMode === "create"
                    ? "Create household"
                    : "Join household"}
              </button>
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
