"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NutritionBadge from "./NutritionBadge";
import RecipeEditor, { toEditableRecipe, fromEditableRecipe, type EditableRecipe } from "./RecipeEditor";
import type { Recipe, Ingredient } from "@/lib/types";
import { CUISINE_LABELS, DIETARY_FLAG_LABELS, MEAL_TYPE_LABELS } from "@/lib/types";

const secondaryButton =
  "inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-border-light";

export default function RecipeDetail({ recipe }: { recipe: Recipe }) {
  // The page keys this component on recipe.updatedAt, so after a save +
  // router.refresh() it remounts with the fresh row — no stale local copy.
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const totalTime = recipe.totalTimeMinutes ?? 0;

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
          <Link href="/recipes" className="text-sm text-text-muted transition-colors hover:text-text-secondary">
            &larr; Back to recipes
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
        <Link href="/recipes" className="text-sm text-text-muted transition-colors hover:text-text-secondary">
          &larr; Back to recipes
        </Link>
        <div className="flex gap-2">
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

      <div className="mb-6">
        <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight text-text">{recipe.title}</h1>
        {recipe.description && <p className="mb-3 text-text-secondary">{recipe.description}</p>}
        <div className="flex flex-wrap gap-2 text-sm text-text-muted">
          {recipe.sourceName && <span>{recipe.sourceName}</span>}
          <span className="rounded-md bg-accent-light px-2 py-0.5 text-accent">{CUISINE_LABELS[recipe.cuisine]}</span>
          <span className="rounded-md bg-border-light px-2 py-0.5 text-text-secondary">{MEAL_TYPE_LABELS[recipe.mealType]}</span>
          {recipe.isSlowCooker && <span className="rounded-md bg-gold-light px-2 py-0.5 text-gold">Slow Cooker</span>}
          {totalTime > 0 && <span>{totalTime} min</span>}
          <span>{recipe.servings} servings</span>
          {recipe.dietaryFlags.map((flag) => (
            <span key={flag} className="rounded-md bg-accent-light px-2 py-0.5 text-accent">
              {DIETARY_FLAG_LABELS[flag]}
            </span>
          ))}
        </div>
      </div>

      {recipe.nutrition && (
        <div className="mb-8">
          <NutritionBadge nutrition={recipe.nutrition} />
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-text">Ingredients</h2>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((ing: Ingredient, i: number) => (
            <li key={i} className="text-text-secondary">
              <span className="font-medium text-text">
                {ing.quantity !== null && `${ing.quantity} `}
                {ing.unit && `${ing.unit} `}
              </span>
              {ing.name}
              {ing.preparation && <span className="text-text-muted">, {ing.preparation}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-text">Instructions</h2>
        <ol className="list-decimal space-y-3 pl-5">
          {recipe.instructions.map((step: string, i: number) => (
            <li key={i} className="leading-relaxed text-text-secondary">{step}</li>
          ))}
        </ol>
      </div>

      {recipe.sourceUrl && (
        <div className="border-t border-border pt-4">
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary transition-colors hover:text-primary-dark"
          >
            View original recipe &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
