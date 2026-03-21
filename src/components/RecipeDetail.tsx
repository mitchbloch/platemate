"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NutritionBadge from "./NutritionBadge";
import type { Recipe, Ingredient, CuisineType, MealType, DifficultyLevel } from "@/lib/types";
import { CUISINE_LABELS } from "@/lib/types";

export default function RecipeDetail({ recipe: initial }: { recipe: Recipe }) {
  const [editing, setEditing] = useState(false);
  const [recipe, setRecipe] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const totalTime = recipe.totalTimeMinutes ?? 0;

  function updateField<K extends keyof Recipe>(key: K, value: Recipe[K]) {
    setRecipe({ ...recipe, [key]: value });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: recipe.title,
          description: recipe.description,
          cuisine: recipe.cuisine,
          mealType: recipe.mealType,
          difficulty: recipe.difficulty,
          servings: recipe.servings,
          totalTimeMinutes: recipe.totalTimeMinutes,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
          isSlowCooker: recipe.isSlowCooker,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(false);
      router.refresh();
    } catch {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/recipes");
      router.refresh();
    } catch {
      alert("Failed to delete recipe");
      setDeleting(false);
    }
  }

  function handleCancel() {
    setRecipe(initial);
    setEditing(false);
  }

  // ── Edit mode ──
  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/recipes"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to recipes
          </Link>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          type="text"
          value={recipe.title}
          onChange={(e) => updateField("title", e.target.value)}
          className="w-full text-3xl font-bold text-gray-900 border-b border-gray-200 pb-2 focus:border-primary focus:outline-none"
        />

        {/* Description */}
        <textarea
          value={recipe.description ?? ""}
          onChange={(e) => updateField("description", e.target.value || null)}
          placeholder="Description"
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Cuisine</label>
            <select
              value={recipe.cuisine}
              onChange={(e) => updateField("cuisine", e.target.value as CuisineType)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Object.entries(CUISINE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Meal Type</label>
            <select
              value={recipe.mealType}
              onChange={(e) => updateField("mealType", e.target.value as MealType)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="dinner">Dinner</option>
              <option value="slow-cooker-lunch">Slow Cooker Lunch</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Difficulty</label>
            <select
              value={recipe.difficulty}
              onChange={(e) => updateField("difficulty", e.target.value as DifficultyLevel)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Servings</label>
            <input
              type="number"
              min={1}
              value={recipe.servings}
              onChange={(e) => updateField("servings", parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Time + slow cooker */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Total Time (min)</label>
          <input
            type="number"
            min={0}
            value={recipe.totalTimeMinutes ?? ""}
            onChange={(e) => updateField("totalTimeMinutes", e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

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
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Ingredients</h2>
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
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => updateField("ingredients", recipe.ingredients.filter((_, j) => j !== i))}
                  className="rounded px-2 py-1.5 text-sm text-gray-400 hover:text-red-600"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => updateField("ingredients", [...recipe.ingredients, { name: "", quantity: null, unit: null, preparation: null, category: "other" as const, raw: "" }])}
            className="mt-2 text-sm text-primary hover:text-primary-dark"
          >
            + Add ingredient
          </button>
        </div>

        {/* Instructions */}
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Instructions</h2>
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
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => updateField("instructions", recipe.instructions.filter((_, j) => j !== i))}
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

        {/* Tags */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Tags (comma-separated)</label>
          <input
            type="text"
            value={recipe.tags.join(", ")}
            onChange={(e) => updateField("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    );
  }

  // ── View mode ──
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/recipes"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to recipes
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "..." : "Yes"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg border border-red-200 px-4 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="mb-3 text-gray-600">{recipe.description}</p>
        )}
        <div className="flex flex-wrap gap-2 text-sm text-gray-500">
          {recipe.sourceName && <span>{recipe.sourceName}</span>}
          {recipe.cuisine && (
            <span className="rounded bg-gray-100 px-2 py-0.5">
              {recipe.cuisine}
            </span>
          )}
          {recipe.isSlowCooker && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
              Slow Cooker
            </span>
          )}
          {totalTime > 0 && <span>{totalTime} min</span>}
          <span>{recipe.servings} servings</span>
        </div>
      </div>

      {recipe.nutrition && (
        <div className="mb-8">
          <NutritionBadge nutrition={recipe.nutrition} />
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Ingredients
        </h2>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((ing: Ingredient, i: number) => (
            <li key={i} className="text-gray-700">
              <span className="font-medium">
                {ing.quantity && `${ing.quantity} `}
                {ing.unit && `${ing.unit} `}
              </span>
              {ing.name}
              {ing.preparation && (
                <span className="text-gray-500">, {ing.preparation}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Instructions
        </h2>
        <ol className="list-decimal space-y-3 pl-5">
          {recipe.instructions.map((step: string, i: number) => (
            <li key={i} className="text-gray-700">
              {step}
            </li>
          ))}
        </ol>
      </div>

      {recipe.sourceUrl && (
        <div className="border-t border-gray-200 pt-4">
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary-dark"
          >
            View original recipe &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
