"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe, CuisineType, MealType, DifficultyLevel, Ingredient } from "@/lib/types";
import { CUISINE_LABELS } from "@/lib/types";
import NutritionBadge from "./NutritionBadge";

type FormState =
  | { step: "input" }
  | { step: "parsing" }
  | { step: "review"; parsed: ParsedRecipe }
  | { step: "saving" }
  | { step: "error"; message: string };

export default function RecipeForm() {
  const [url, setUrl] = useState("");
  const [formState, setFormState] = useState<FormState>({ step: "input" });
  const [editedRecipe, setEditedRecipe] = useState<ParsedRecipe | null>(null);
  const router = useRouter();

  const recipe = editedRecipe;

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setFormState({ step: "parsing" });

    try {
      const res = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
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
          <div>
            <label
              htmlFor="url"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Recipe URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://cooking.nytimes.com/recipes/..."
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {formState.step === "error" && (
            <p className="text-sm text-red-600">{formState.message}</p>
          )}

          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-2 font-medium text-white hover:bg-primary-dark"
          >
            Import Recipe
          </button>
        </form>
      </div>
    );
  }

  // ── Parsing step ──
  if (formState.step === "parsing") {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <p className="text-gray-600">
          Fetching recipe and analyzing nutrition...
        </p>
        <p className="mt-1 text-sm text-gray-400">This may take a few seconds</p>
      </div>
    );
  }

  // ── Saving step ──
  if (formState.step === "saving") {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <p className="text-gray-600">Saving recipe...</p>
      </div>
    );
  }

  // ── Review step ──
  if (!recipe) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Review the extracted recipe below. Edit any fields before saving.
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          type="text"
          value={recipe.title}
          onChange={(e) => updateField("title", e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={recipe.description ?? ""}
          onChange={(e) => updateField("description", e.target.value || null)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Cuisine
          </label>
          <select
            value={recipe.cuisine}
            onChange={(e) => updateField("cuisine", e.target.value as CuisineType)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {Object.entries(CUISINE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Meal Type
          </label>
          <select
            value={recipe.mealType}
            onChange={(e) => updateField("mealType", e.target.value as MealType)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="dinner">Dinner</option>
            <option value="slow-cooker-lunch">Slow Cooker Lunch</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Difficulty
          </label>
          <select
            value={recipe.difficulty}
            onChange={(e) => updateField("difficulty", e.target.value as DifficultyLevel)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Servings
          </label>
          <input
            type="number"
            min={1}
            value={recipe.servings}
            onChange={(e) => updateField("servings", parseInt(e.target.value) || 1)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Time */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Total Time (min)
        </label>
        <input
          type="number"
          min={0}
          value={recipe.totalTimeMinutes ?? ""}
          onChange={(e) =>
            updateField("totalTimeMinutes", e.target.value ? parseInt(e.target.value) : null)
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Slow cooker toggle */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={recipe.isSlowCooker}
          onChange={(e) => updateField("isSlowCooker", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="text-sm text-gray-700">Slow cooker recipe</span>
      </label>

      {/* Ingredients */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
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
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => {
                  const updated = recipe.ingredients.filter((_, j) => j !== i);
                  updateField("ingredients", updated);
                }}
                className="rounded px-2 py-1.5 text-sm text-gray-400 hover:text-red-600"
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
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Instructions
        </label>
        <div className="space-y-2">
          {recipe.instructions.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1.5 text-xs text-gray-400">{i + 1}.</span>
              <textarea
                value={step}
                onChange={(e) => {
                  const updated = [...recipe.instructions];
                  updated[i] = e.target.value;
                  updateField("instructions", updated);
                }}
                rows={2}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => {
                  const updated = recipe.instructions.filter((_, j) => j !== i);
                  updateField("instructions", updated);
                }}
                className="rounded px-2 py-1.5 text-sm text-gray-400 hover:text-red-600"
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
        <label className="mb-1 block text-sm font-medium text-gray-700">
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={handleSave}
          className="rounded-lg bg-primary px-6 py-2 font-medium text-white hover:bg-primary-dark"
        >
          Save Recipe
        </button>
        <button
          onClick={() => {
            setFormState({ step: "input" });
            setEditedRecipe(null);
          }}
          className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
