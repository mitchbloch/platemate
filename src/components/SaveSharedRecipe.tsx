"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
  /** Null when signed out; otherwise the id of this recipe if it's already
   *  in one of the viewer's households. */
  viewer: null | { ownedRecipeId: string | null };
};

/** Sticky call to action on a shared recipe page. */
export default function SaveSharedRecipe({ token, viewer }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedId, setOwnedId] = useState<string | null>(viewer?.ownedRecipeId ?? null);
  const next = encodeURIComponent(`/r/${token}`);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}/save`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.recipeId) {
        setOwnedId(data.recipeId);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Couldn't save this recipe");
      router.push(`/recipes/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this recipe");
    } finally {
      setSaving(false);
    }
  }

  const bar = "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur-sm";
  const barStyle = { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" };
  const primary = "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50";
  const secondary = "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-border-light";

  if (!viewer) {
    return (
      <div className={bar} style={barStyle}>
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Link href={`/login?next=${next}`} className={primary}>Sign in to save</Link>
          <Link href={`/signup?next=${next}`} className={secondary}>Create an account</Link>
        </div>
      </div>
    );
  }

  if (ownedId) {
    return (
      <div className={bar} style={barStyle}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">Already in your library.</span>
          <Link href={`/recipes/${ownedId}`} className={secondary + " flex-none"}>Open it</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={bar} style={barStyle}>
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="button" onClick={save} disabled={saving} className={primary}>
          {saving ? "Saving…" : "Save to my recipes"}
        </button>
      </div>
    </div>
  );
}
