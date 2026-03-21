"use client";

import Nav from "@/components/Nav";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

        {loading ? (
          <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
        ) : (
          <div className="rounded-xl border border-gray-200 p-6">
            <h2 className="mb-2 text-sm font-medium text-gray-500">Account</h2>
            <p className="mb-4 text-gray-900">{user?.email}</p>
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        )}
      </main>
    </>
  );
}
