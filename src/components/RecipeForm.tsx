"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/lib/types";
import { DIETARY_FLAG_LABELS } from "@/lib/types";
import NutritionBadge from "./NutritionBadge";
import RecipeEditor, { toEditableRecipe, fromEditableRecipe, type EditableRecipe } from "./RecipeEditor";

type InputMode = "url" | "text";

type FormState =
  | { step: "input" }
  | { step: "parsing" }
  | { step: "review"; parsed: ParsedRecipe }
  | { step: "saving" }
  | { step: "error"; message: string; isVideoUrl?: boolean };

export default function RecipeForm() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [formState, setFormState] = useState<FormState>({ step: "input" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editedRecipe, setEditedRecipe] = useState<EditableRecipe | null>(null);
  const router = useRouter();

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();

    if (inputMode === "url" && !url.trim()) return;
    if (inputMode === "text" && !recipeText.trim()) return;

    setFormState({ step: "parsing" });

    try {
      let res: Response;

      if (inputMode === "text") {
        res = await fetch("/api/recipes/parse-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: recipeText.trim(),
            sourceUrl: url.trim() || undefined,
          }),
        });
      } else {
        res = await fetch("/api/recipes/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        // If the API tells us it's a video URL, switch to text mode
        if (data.isVideoUrl) {
          setInputMode("text");
          setFormState({
            step: "error",
            message: data.error,
            isVideoUrl: true,
          });
          return;
        }
        throw new Error(data.error || "Failed to parse recipe");
      }

      const parsed: ParsedRecipe = await res.json();
      setEditedRecipe(toEditableRecipe(parsed));
      setFormState({ step: "review", parsed });
    } catch (err) {
      setFormState({
        step: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleSave() {
    if (!editedRecipe || formState.step !== "review") return;
    const { parsed } = formState;

    setFormState({ step: "saving" });

    try {
      // Editable fields come from the editor; everything Claude produced
      // that the user can't edit (nutrition, flags, image, source) is kept.
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed,
          ...fromEditableRecipe(editedRecipe),
          sourceUrl: url.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save recipe");
      }

      const { id } = await res.json();
      router.push(`/recipes/${id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
      setFormState({ step: "review", parsed });
    }
  }

  // ── Input step ──
  if (formState.step === "input" || formState.step === "error") {
    return (
      <div>
        <form onSubmit={handleParse} className="space-y-4">
          {inputMode === "url" ? (
            <div>
              <label
                htmlFor="url"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Recipe URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste any recipe link — websites, TikTok, YouTube..."
                required
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
              <p className="mt-1.5 text-xs text-text-muted">
                Works with recipe sites, TikTok, and YouTube.{" "}
                <button
                  type="button"
                  onClick={() => setInputMode("text")}
                  className="text-primary hover:text-primary-dark"
                >
                  Or paste recipe text instead
                </button>
              </p>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="recipe-text"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Recipe Text
                </label>
                <textarea
                  id="recipe-text"
                  value={recipeText}
                  onChange={(e) => setRecipeText(e.target.value)}
                  placeholder="Paste the recipe here — ingredients, instructions, whatever you have. It doesn't need to be perfectly formatted."
                  required
                  rows={8}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  For recipes from screenshots, texts, or videos that couldn&apos;t be auto-imported.{" "}
                  <button
                    type="button"
                    onClick={() => setInputMode("url")}
                    className="text-primary hover:text-primary-dark"
                  >
                    Or paste a URL instead
                  </button>
                </p>
              </div>
              {/* Optional source URL for text mode */}
              <div>
                <label
                  htmlFor="source-url"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Source URL <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="source-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.instagram.com/..."
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
              </div>
            </>
          )}

          {formState.step === "error" && (
            <div
              className={`rounded-xl border p-3 text-sm ${
                formState.isVideoUrl
                  ? "border-gold-light bg-gold-light/50 text-gold"
                  : "border-danger-light bg-danger-light/50 text-danger"
              }`}
            >
              {formState.message}
            </div>
          )}

          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
          >
            Import Recipe
          </button>
        </form>
      </div>
    );
  }

  // ── Parsing step ──
  if (formState.step === "parsing") {
    const isVideo = /tiktok\.com|instagram\.com|youtube\.com|youtu\.be/.test(url);
    return (
      <div className="py-12 text-center">
        <div className="spinner mx-auto mb-4 h-8 w-8" />
        <p className="text-text-secondary">
          {inputMode === "text"
            ? "Analyzing recipe text..."
            : isVideo
              ? "Extracting recipe from video..."
              : "Fetching recipe and analyzing nutrition..."}
        </p>
        <p className="mt-1 text-sm text-text-muted">This may take a few seconds</p>
      </div>
    );
  }

  // ── Saving step ──
  if (formState.step === "saving") {
    return (
      <div className="py-12 text-center">
        <div className="spinner mx-auto mb-4 h-8 w-8" />
        <p className="text-text-secondary">Saving recipe...</p>
      </div>
    );
  }

  // ── Review step ──
  if (!editedRecipe || formState.step !== "review") return null;
  const parsed = formState.parsed;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent-light bg-accent-light/50 p-3 text-sm text-accent">
        Review the extracted recipe below. Edit any fields before saving.
      </div>

      {parsed.dietaryFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsed.dietaryFlags.map((flag) => (
            <span key={flag} className="rounded-md bg-accent-light px-2 py-0.5 text-xs text-accent">
              {DIETARY_FLAG_LABELS[flag]}
            </span>
          ))}
        </div>
      )}

      <RecipeEditor value={editedRecipe} onChange={setEditedRecipe} />

      <NutritionBadge nutrition={parsed.nutrition} />

      {saveError && (
        <div role="alert" className="rounded-xl border border-danger-light bg-danger-light/50 p-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      <div className="flex gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={handleSave}
          className="min-h-11 rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
        >
          Save Recipe
        </button>
        <button
          type="button"
          onClick={() => {
            setFormState({ step: "input" });
            setEditedRecipe(null);
            setSaveError(null);
          }}
          className="min-h-11 rounded-lg border border-border px-6 py-2 text-text-secondary transition-colors hover:bg-border-light hover:text-text"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
