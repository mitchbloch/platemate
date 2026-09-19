"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RecipeEditor, { toEditableRecipe, fromEditableRecipe, type EditableRecipe } from "./RecipeEditor";
import type { Recipe, RecipeShare } from "@/lib/types";
import ShareRecipeButton from "./ShareRecipeButton";
import RecipeContent from "./RecipeContent";

const secondaryButton =
  "inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-border-light";

export default function RecipeDetail({
  recipe,
  back = { href: "/recipes", label: "Back to recipes" },
  share = null,
}: {
  recipe: Recipe;
  back?: { href: string; label: string };
  share?: RecipeShare | null;
}) {
  // The page keys this component on recipe.updatedAt, so after a save +
  // router.refresh() it remounts with the fresh row — no stale local copy.
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fromEditableRecipe(draft)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save changes");
      }
      setDraft(null);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/recipes");
      router.refresh();
    } catch {
      alert("Failed to delete recipe");
      setDeleting(false);
    }
  }

  // ── Edit mode ──
  if (draft) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href={back.href} className="inline-flex min-h-11 items-center text-sm text-text-muted transition-colors hover:text-text-secondary">
            &larr; {back.label}
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)} className={secondaryButton}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {saveError && (
          <div role="alert" className="rounded-xl border border-danger-light bg-danger-light/50 p-3 text-sm text-danger">
            {saveError}
          </div>
        )}

        <RecipeEditor value={draft} onChange={setDraft} />
      </div>
    );
  }

  // ── View mode ──
  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <Link href={back.href} className="inline-flex min-h-11 items-center text-sm text-text-muted transition-colors hover:text-text-secondary">
          &larr; {back.label}
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          <ShareRecipeButton recipe={recipe} initialShare={share} />
          <button type="button" onClick={() => setDraft(toEditableRecipe(recipe))} className={secondaryButton}>
            Edit
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Delete?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex min-h-11 items-center rounded-lg bg-danger px-3 text-sm text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting ? "..." : "Yes"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={`${secondaryButton} px-3`}>
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-11 items-center rounded-lg border border-danger-light px-4 text-sm text-danger transition-colors hover:bg-danger-light/50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <RecipeContent recipe={recipe} />
    </div>
  );
}
