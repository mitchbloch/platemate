"use client";

import Nav from "@/components/Nav";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-text">Settings</h1>

        {loading ? (
          <div className="h-20 animate-pulse rounded-2xl bg-border-light" />
        ) : (
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
        )}
      </main>
    </>
  );
}
