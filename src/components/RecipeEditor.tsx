"use client";

import { useState } from "react";
import type {
  CuisineType,
  DifficultyLevel,
  Ingredient,
  IngredientCategory,
  MealType,
  ParsedRecipe,
} from "@/lib/types";
import { CATEGORY_LABELS, CUISINE_LABELS, MEAL_TYPE_LABELS } from "@/lib/types";
import { ingredientRaw, type RecipeUpdates } from "@/lib/recipeValidation";
import { normalizeShoppingName } from "@/lib/shoppingName";
import NumberField from "./NumberField";

// ── Editable shape (stable keys so rows keep focus when siblings change) ──

export interface EditableIngredient extends Ingredient {
  key: string;
  /** As loaded: renaming away from this drops the shopping name (it was
   *  produced for the old name); renaming back restores it. */
  original: { name: string; shoppingName: string | null | undefined } | null;
}

export interface EditableStep {
  key: string;
  text: string;
}

export interface EditableRecipe {
  title: string;
  description: string | null;
  cuisine: CuisineType;
  mealType: MealType;
  difficulty: DifficultyLevel;
  servings: number;
  totalTimeMinutes: number | null;
  ingredients: EditableIngredient[];
  instructions: EditableStep[];
  tags: string[];
  isSlowCooker: boolean;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

type EditableSource = Pick<
  ParsedRecipe,
  | "title" | "description" | "cuisine" | "mealType" | "difficulty" | "servings"
  | "totalTimeMinutes" | "ingredients" | "instructions" | "tags" | "isSlowCooker"
>;

export function toEditableRecipe(recipe: EditableSource): EditableRecipe {
  return {
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    mealType: recipe.mealType,
    difficulty: recipe.difficulty,
    servings: recipe.servings,
    totalTimeMinutes: recipe.totalTimeMinutes,
    ingredients: recipe.ingredients.map((ing) => ({ ...ing, key: nextKey(), original: { name: ing.name, shoppingName: ing.shoppingName } })),
    instructions: recipe.instructions.map((text) => ({ key: nextKey(), text })),
    tags: recipe.tags,
    isSlowCooker: recipe.isSlowCooker,
  };
}

/** Strip editor keys; the result is exactly what the API validates. */
export function fromEditableRecipe(recipe: EditableRecipe): Required<RecipeUpdates> {
  return {
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    mealType: recipe.mealType,
    difficulty: recipe.difficulty,
    servings: recipe.servings,
    totalTimeMinutes: recipe.totalTimeMinutes,
    ingredients: recipe.ingredients.map(({ name, quantity, unit, preparation, category, raw, shoppingName }) => ({
      name, quantity, unit, preparation, category, raw,
      // Typed text is kept verbatim while editing; normalize once on save
      ...(shoppingName === undefined ? {} : { shoppingName: normalizeShoppingName(shoppingName) }),
    })),
    instructions: recipe.instructions.map((s) => s.text),
    tags: recipe.tags,
    isSlowCooker: recipe.isSlowCooker,
  };
}

export function blankIngredient(): EditableIngredient {
  return { key: nextKey(), original: null, name: "", quantity: null, unit: null, preparation: null, category: "other", raw: "" };
}

// ── Styles ──

const fieldClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light";
const labelClass = "mb-1 block text-sm font-medium text-text-secondary";
const removeClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-text-muted transition-colors hover:text-danger";

// ── Component ──

export default function RecipeEditor({
  value,
  onChange,
}: {
  value: EditableRecipe;
  onChange: (next: EditableRecipe) => void;
}) {
  function set<K extends keyof EditableRecipe>(key: K, v: EditableRecipe[K]) {
    onChange({ ...value, [key]: v });
  }

  function setIngredient(key: string, patch: Partial<Ingredient>) {
    set(
      "ingredients",
      value.ingredients.map((ing) => {
        if (ing.key !== key) return ing;
        const next = { ...ing, ...patch };
        // A renamed ingredient's canonical shopping name is no longer
        // trustworthy: drop it so the merge falls back to the new name, and
        // bring it back if the user types their way back to the original.
        if (patch.name !== undefined && patch.shoppingName === undefined && ing.original) {
          next.shoppingName = patch.name === ing.original.name ? ing.original.shoppingName : null;
        }
        // raw is derived from the structured fields — they are what the app
        // displays and what the grocery list reads
        return { ...next, raw: ingredientRaw(next) };
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="recipe-title" className={labelClass}>Title</label>
        <input
          id="recipe-title"
          type="text"
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          className={`w-full ${fieldClass}`}
        />
      </div>

      <div>
        <label htmlFor="recipe-description" className={labelClass}>Description</label>
        <textarea
          id="recipe-description"
          value={value.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
          rows={2}
          className={`w-full ${fieldClass}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="recipe-cuisine" className={labelClass}>Cuisine</label>
          <select
            id="recipe-cuisine"
            value={value.cuisine}
            onChange={(e) => set("cuisine", e.target.value as CuisineType)}
            className={`w-full ${fieldClass}`}
          >
            {Object.entries(CUISINE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="recipe-meal-type" className={labelClass}>Meal Type</label>
          <select
            id="recipe-meal-type"
            value={value.mealType}
            onChange={(e) => set("mealType", e.target.value as MealType)}
            className={`w-full ${fieldClass}`}
          >
            {Object.entries(MEAL_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="recipe-difficulty" className={labelClass}>Difficulty</label>
          <select
            id="recipe-difficulty"
            value={value.difficulty}
            onChange={(e) => set("difficulty", e.target.value as DifficultyLevel)}
            className={`w-full ${fieldClass}`}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label htmlFor="recipe-servings" className={labelClass}>Servings</label>
          <NumberField
            id="recipe-servings"
            value={value.servings}
            onChange={(n) => set("servings", n ?? 1)}
            min={1}
            max={99}
            integer
            className={`w-full ${fieldClass}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="recipe-time" className={labelClass}>Total Time (min)</label>
        <NumberField
          id="recipe-time"
          value={value.totalTimeMinutes}
          onChange={(n) => set("totalTimeMinutes", n)}
          min={0}
          integer
          allowEmpty
          className={`w-full ${fieldClass}`}
        />
      </div>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={value.isSlowCooker}
          onChange={(e) => set("isSlowCooker", e.target.checked)}
          className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-sm text-text-secondary">Slow cooker recipe</span>
      </label>

      {/* Ingredients */}
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-text">Ingredients</h2>
        <div className="space-y-2">
          {value.ingredients.map((ing, i) => (
            <IngredientRow
              key={ing.key}
              index={i}
              ingredient={ing}
              onChange={(patch) => setIngredient(ing.key, patch)}
              onRemove={() => set("ingredients", value.ingredients.filter((x) => x.key !== ing.key))}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => set("ingredients", [...value.ingredients, blankIngredient()])}
          className="mt-2 min-h-11 text-sm text-primary hover:text-primary-dark"
        >
          + Add ingredient
        </button>
      </div>

      {/* Instructions */}
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-text">Instructions</h2>
        <div className="space-y-2">
          {value.instructions.map((step, i) => (
            <div key={step.key} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-xs text-text-muted">{i + 1}.</span>
              <textarea
                value={step.text}
                aria-label={`Step ${i + 1}`}
                onChange={(e) =>
                  set(
                    "instructions",
                    value.instructions.map((s) => (s.key === step.key ? { ...s, text: e.target.value } : s)),
                  )
                }
                rows={2}
                className={`min-w-0 flex-1 ${fieldClass} text-sm`}
              />
              <button
                type="button"
                onClick={() => set("instructions", value.instructions.filter((s) => s.key !== step.key))}
                className={removeClass}
                aria-label={`Remove step ${i + 1}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => set("instructions", [...value.instructions, { key: nextKey(), text: "" }])}
          className="mt-2 min-h-11 text-sm text-primary hover:text-primary-dark"
        >
          + Add step
        </button>
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="recipe-tags" className={labelClass}>Tags (comma-separated)</label>
        <input
          id="recipe-tags"
          type="text"
          defaultValue={value.tags.join(", ")}
          onBlur={(e) =>
            set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))
          }
          className={`w-full ${fieldClass}`}
        />
      </div>
    </div>
  );
}

function IngredientRow({
  index,
  ingredient,
  onChange,
  onRemove,
}: {
  index: number;
  ingredient: EditableIngredient;
  onChange: (patch: Partial<Ingredient>) => void;
  onRemove: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const n = index + 1;
  const small = `${fieldClass} px-2 py-2 text-sm`;

  return (
    <div className="rounded-xl border border-border-light bg-surface/60 p-2">
      <div className="flex items-start gap-2">
        <NumberField
          value={ingredient.quantity}
          onChange={(quantity) => onChange({ quantity })}
          min={0}
          allowEmpty
          placeholder="Qty"
          aria-label={`Ingredient ${n} quantity`}
          className={`w-16 shrink-0 ${small}`}
        />
        <input
          type="text"
          value={ingredient.unit ?? ""}
          onChange={(e) => onChange({ unit: e.target.value || null })}
          placeholder="Unit"
          aria-label={`Ingredient ${n} unit`}
          className={`w-20 shrink-0 ${small}`}
        />
        <input
          type="text"
          value={ingredient.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ingredient"
          aria-label={`Ingredient ${n} name`}
          className={`min-w-0 flex-1 ${small}`}
        />
        <button type="button" onClick={onRemove} className={removeClass} aria-label={`Remove ingredient ${n}`}>
          &times;
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="min-h-9 px-1 text-xs text-text-muted hover:text-text-secondary"
        >
          {showMore
            ? "Less"
            : `${CATEGORY_LABELS[ingredient.category]}${ingredient.preparation ? ` · ${ingredient.preparation}` : ""}${ingredient.shoppingName ? ` · shops as ${ingredient.shoppingName}` : ""} · edit`}
        </button>
        {showMore && (
          <>
            <select
              value={ingredient.category}
              onChange={(e) => onChange({ category: e.target.value as IngredientCategory })}
              aria-label={`Ingredient ${n} category`}
              className={`${small} py-1 text-xs`}
            >
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="text"
              value={ingredient.preparation ?? ""}
              onChange={(e) => onChange({ preparation: e.target.value || null })}
              placeholder="Prep (diced, minced...)"
              aria-label={`Ingredient ${n} preparation`}
              className={`min-w-0 flex-1 ${small} py-1 text-xs`}
            />
            <input
              type="text"
              value={ingredient.shoppingName ?? ""}
              onChange={(e) => onChange({ shoppingName: e.target.value || null })}
              placeholder="Shops as (greek yogurt)"
              title="Brand-agnostic name used to merge this with other recipes on the grocery list"
              aria-label={`Ingredient ${n} shopping name`}
              className={`min-w-0 flex-1 ${small} py-1 text-xs`}
            />
          </>
        )}
      </div>
    </div>
  );
}
