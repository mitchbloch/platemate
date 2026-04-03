"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe, CuisineType, MealType, DifficultyLevel, Ingredient } from "@/lib/types";
import { CUISINE_LABELS, DIETARY_FLAG_LABELS } from "@/lib/types";
import NutritionBadge from "./NutritionBadge";

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
  const [editedRecipe, setEditedRecipe] = useState<ParsedRecipe | null>(null);
  const router = useRouter();

  const recipe = editedRecipe;

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
      setEditedRecipe(parsed);
      setFormState({ step: "review", parsed });
    } catch (err) {
      setFormState({
        step: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleSave() {
    if (!recipe) return;

    setFormState({ step: "saving" });

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...recipe, sourceUrl: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save recipe");
      }

      const { id } = await res.json();
      router.push(`/recipes/${id}`);
    } catch (err) {
      setFormState({
        step: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  function updateField<K extends keyof ParsedRecipe>(key: K, value: ParsedRecipe[K]) {
    if (!recipe) return;
    setEditedRecipe({ ...recipe, [key]: value });
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
  if (!recipe) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent-light bg-accent-light/50 p-3 text-sm text-accent">
        Review the extracted recipe below. Edit any fields before saving.
      </div>

      {/* Dietary Flags */}
      {recipe.dietaryFlags && recipe.dietaryFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.dietaryFlags.map((flag) => (
            <span
              key={flag}
              className="rounded-md bg-accent-light px-2 py-0.5 text-xs text-accent"
            >
              {DIETARY_FLAG_LABELS[flag]}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Title
        </label>
        <input
          type="text"
          value={recipe.title}
          onChange={(e) => updateField("title", e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Description
        </label>
        <textarea
          value={recipe.description ?? ""}
          onChange={(e) => updateField("description", e.target.value || null)}
          rows={2}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Cuisine
          </label>
          <select
            value={recipe.cuisine}
            onChange={(e) => updateField("cuisine", e.target.value as CuisineType)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            {Object.entries(CUISINE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Meal Type
          </label>
          <select
            value={recipe.mealType}
            onChange={(e) => updateField("mealType", e.target.value as MealType)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snacks">Snacks</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Difficulty
          </label>
          <select
            value={recipe.difficulty}
            onChange={(e) => updateField("difficulty", e.target.value as DifficultyLevel)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Servings
          </label>
          <input
            type="number"
            min={1}
            value={recipe.servings}
            onChange={(e) => updateField("servings", parseInt(e.target.value) || 1)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
        </div>
      </div>

      {/* Time */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Total Time (min)
        </label>
        <input
          type="number"
          min={0}
          value={recipe.totalTimeMinutes ?? ""}
          onChange={(e) =>
            updateField("totalTimeMinutes", e.target.value ? parseInt(e.target.value) : null)
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
      </div>

      {/* Slow cooker toggle */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={recipe.isSlowCooker}
          onChange={(e) => updateField("isSlowCooker", e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-sm text-text-secondary">Slow cooker recipe</span>
      </label>

      {/* Ingredients */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-secondary">
          Ingredients
        </label>
        <div className="space-y-2">
          {recipe.ingredients.map((ing, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                type="text"
                value={ing.raw}
                onChange={(e) => {
                  const updated = [...recipe.ingredients];
                  updated[i] = { ...updated[i], raw: e.target.value };
                  updateField("ingredients", updated);
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
              <button
                onClick={() => {
                  const updated = recipe.ingredients.filter((_, j) => j !== i);
                  updateField("ingredients", updated);
                }}
                className="rounded px-2 py-1.5 text-sm text-text-muted hover:text-danger transition-colors"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            const blank: Ingredient = {
              name: "",
              quantity: null,
              unit: null,
              preparation: null,
              category: "other",
              raw: "",
            };
            updateField("ingredients", [...recipe.ingredients, blank]);
          }}
          className="mt-2 text-sm text-primary hover:text-primary-dark"
        >
          + Add ingredient
        </button>
      </div>

      {/* Instructions */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-secondary">
          Instructions
        </label>
        <div className="space-y-2">
          {recipe.instructions.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1.5 text-xs text-text-muted">{i + 1}.</span>
              <textarea
                value={step}
                onChange={(e) => {
                  const updated = [...recipe.instructions];
                  updated[i] = e.target.value;
                  updateField("instructions", updated);
                }}
                rows={2}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
              <button
                onClick={() => {
                  const updated = recipe.instructions.filter((_, j) => j !== i);
                  updateField("instructions", updated);
                }}
                className="rounded px-2 py-1.5 text-sm text-text-muted hover:text-danger transition-colors"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => updateField("instructions", [...recipe.instructions, ""])}
          className="mt-2 text-sm text-primary hover:text-primary-dark"
        >
          + Add step
        </button>
      </div>

      {/* Nutrition */}
      {recipe.nutrition && <NutritionBadge nutrition={recipe.nutrition} />}

      {/* Tags */}
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={recipe.tags.join(", ")}
          onChange={(e) =>
            updateField(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-border pt-4">
        <button
          onClick={handleSave}
          className="rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
        >
          Save Recipe
        </button>
        <button
          onClick={() => {
            setFormState({ step: "input" });
            setEditedRecipe(null);
          }}
          className="rounded-lg border border-border px-6 py-2 text-text-secondary transition-colors hover:bg-border-light hover:text-text"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
