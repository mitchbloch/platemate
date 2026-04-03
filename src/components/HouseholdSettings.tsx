"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Household,
  HouseholdMember,
  HouseholdRole,
  StoreName,
  MealType,
  MealSchedule,
  IngredientCategory,
  GroceryCategory,
  NutritionPriority,
  NutritionInfo,
} from "@/lib/types";
import {
  STORE_LABELS,
  MEAL_TYPE_LABELS,
  NUTRITION_LABELS,
  CATEGORY_LABELS,
} from "@/lib/types";

// ── Constants ──

const ALL_STORES: StoreName[] = [
  "trader-joes",
  "whole-foods",
  "hmart",
  "target",
  "other",
];

const ALL_MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];

const ALL_INGREDIENT_CATEGORIES: IngredientCategory[] = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "grain",
  "canned",
  "spice",
  "oil-vinegar",
  "condiment",
  "frozen",
  "other",
];

const ALL_NUTRIENTS: (keyof NutritionInfo)[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "saturatedFat",
  "cholesterol",
  "fiber",
  "sodium",
];

const DIETARY_OPTIONS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "shellfish-free",
  "low-sodium",
  "low-cholesterol",
  "halal",
  "kosher",
] as const;

const AUTOSAVE_DELAY = 500;

// ── Shared Styles ──

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light";

const btnPrimary =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50";

const btnSecondary =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg";

const btnDanger =
  "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50";

const cardClass =
  "rounded-2xl border border-border bg-surface p-6 shadow-warm";

const arrowBtnClass =
  "rounded-md border border-border-light bg-surface px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-bg disabled:opacity-30";

// ── Props ──

interface HouseholdSettingsProps {
  household: Household;
  currentUserId: string;
}

// ── Component ──

export default function HouseholdSettings({
  household: initial,
  currentUserId,
}: HouseholdSettingsProps) {
  // ── Core State ──
  const [household, setHousehold] = useState<Household>(initial);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);

  // ── Grocery Categories Editing ──
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);

  // ── Autosave Timer ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHousehold = useRef(household);
  latestHousehold.current = household;

  // ── Derived ──
  const currentMember = members.find((m) => m.userId === currentUserId);
  const isAdmin = currentMember?.role === "admin";

  // ── API Helpers ──

  const savePreferences = useCallback(
    async (updates: Partial<Household>) => {
      setSaveStatus("saving");
      try {
        const res = await fetch(
          `/api/households/${latestHousehold.current.id}/preferences`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!res.ok) throw new Error("Save failed");
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    },
    []
  );

  const scheduleSave = useCallback(
    (updates: Partial<Household>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => savePreferences(updates), AUTOSAVE_DELAY);
    },
    [savePreferences]
  );

  function updateHousehold<K extends keyof Household>(key: K, value: Household[K]) {
    const next = { ...latestHousehold.current, [key]: value };
    setHousehold(next);
    scheduleSave({ [key]: value });
  }

  // ── Fetch Members ──

  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch(`/api/households/${initial.id}/members`);
        if (res.ok) {
          const data = await res.json();
          setMembers(data);
        }
      } catch {
        // silently fail — members section just shows empty
      }
    }
    fetchMembers();
  }, [initial.id]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Member Actions ──

  async function updateMemberRole(userId: string, role: HouseholdRole) {
    try {
      const res = await fetch(
        `/api/households/${household.id}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (!res.ok) throw new Error("Failed to update role");
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role } : m))
      );
    } catch {
      alert("Failed to update member role");
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the household?")) return;
    try {
      const res = await fetch(
        `/api/households/${household.id}/members/${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      alert("Failed to remove member");
    }
  }

  // ── Invite Code Copy ──

  function handleCopyInvite() {
    navigator.clipboard.writeText(household.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Grocery Store Helpers ──

  function toggleStore(store: StoreName) {
    const stores = household.groceryStores.includes(store)
      ? household.groceryStores.filter((s) => s !== store)
      : [...household.groceryStores, store];

    // If removing the default store, pick the first remaining (or "other")
    let defaultStore = household.defaultStore;
    if (!stores.includes(defaultStore)) {
      defaultStore = stores[0] ?? "other";
    }

    const next = { ...latestHousehold.current, groceryStores: stores, defaultStore };
    setHousehold(next);
    scheduleSave({ groceryStores: stores, defaultStore });
  }

  function moveStore(index: number, direction: -1 | 1) {
    const stores = [...household.groceryStores];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stores.length) return;
    [stores[index], stores[targetIndex]] = [stores[targetIndex], stores[index]];
    updateHousehold("groceryStores", stores);
  }

  // ── Grocery Category Helpers ──

  function updateCategory(index: number, updates: Partial<GroceryCategory>) {
    const categories = [...household.groceryCategories];
    categories[index] = { ...categories[index], ...updates };
    updateHousehold("groceryCategories", categories);
  }

  function addCategory() {
    const categories = [
      ...household.groceryCategories,
      { name: "New Category", ingredientTypes: [] as IngredientCategory[] },
    ];
    updateHousehold("groceryCategories", categories);
    setExpandedCategory(categories.length - 1);
  }

  function removeCategory(index: number) {
    const categories = household.groceryCategories.filter((_, i) => i !== index);
    updateHousehold("groceryCategories", categories);
    if (expandedCategory === index) setExpandedCategory(null);
    else if (expandedCategory !== null && expandedCategory > index) {
      setExpandedCategory(expandedCategory - 1);
    }
  }

  function moveCategoryItem(index: number, direction: -1 | 1) {
    const categories = [...household.groceryCategories];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    [categories[index], categories[targetIndex]] = [
      categories[targetIndex],
      categories[index],
    ];
    updateHousehold("groceryCategories", categories);
    // Update expanded index if it was one of the swapped items
    if (expandedCategory === index) setExpandedCategory(targetIndex);
    else if (expandedCategory === targetIndex) setExpandedCategory(index);
  }

  function toggleCategoryIngredient(
    categoryIndex: number,
    ingredient: IngredientCategory
  ) {
    const cat = household.groceryCategories[categoryIndex];
    const types = cat.ingredientTypes.includes(ingredient)
      ? cat.ingredientTypes.filter((t) => t !== ingredient)
      : [...cat.ingredientTypes, ingredient];
    updateCategory(categoryIndex, { ingredientTypes: types });
  }

  // ── Nutrition Priority Helpers ──

  function toggleNutrient(nutrient: keyof NutritionInfo) {
    const priorities = [...household.nutritionPriorities];
    const existing = priorities.findIndex((p) => p.nutrient === nutrient);
    if (existing >= 0) {
      priorities.splice(existing, 1);
      // Re-rank remaining
      priorities.forEach((p, i) => (p.rank = i + 1));
    } else {
      priorities.push({ nutrient, rank: priorities.length + 1 });
    }
    updateHousehold("nutritionPriorities", priorities);
  }

  function moveNutrient(index: number, direction: -1 | 1) {
    const priorities = [...household.nutritionPriorities];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= priorities.length) return;
    [priorities[index], priorities[targetIndex]] = [
      priorities[targetIndex],
      priorities[index],
    ];
    // Re-rank
    priorities.forEach((p, i) => (p.rank = i + 1));
    updateHousehold("nutritionPriorities", priorities);
  }

  // ── Render ──

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Save Status Indicator */}
      <div className="flex items-center justify-end gap-2 text-sm">
        {saveStatus === "saving" && (
          <span className="text-text-muted">Saving...</span>
        )}
        {saveStatus === "saved" && (
          <span className="text-accent">Saved</span>
        )}
        {saveStatus === "error" && (
          <span className="text-red-600">Failed to save</span>
        )}
      </div>

      {/* 1. Household Name */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Household Name
        </h2>
        {isAdmin ? (
          <input
            type="text"
            value={household.name}
            onChange={(e) => updateHousehold("name", e.target.value)}
            className={`${inputClass} w-full max-w-md`}
          />
        ) : (
          <p className="text-text">{household.name}</p>
        )}
      </section>

      {/* 2. Members */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Members
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-text-muted">Loading members...</p>
        ) : (
          <ul className="space-y-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border-light p-3"
              >
                <span className="text-sm font-medium text-text">
                  {member.userId === currentUserId ? "You" : member.userId}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    member.role === "admin"
                      ? "bg-primary/10 text-primary"
                      : "bg-accent/10 text-accent"
                  }`}
                >
                  {member.role}
                </span>
                {isAdmin && member.userId !== currentUserId && (
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() =>
                        updateMemberRole(
                          member.userId,
                          member.role === "admin" ? "member" : "admin"
                        )
                      }
                      className={btnSecondary}
                    >
                      {member.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button
                      onClick={() => removeMember(member.userId)}
                      className={btnDanger}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Invite Code */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Invite Code
        </h2>
        <div className="flex items-center gap-3">
          <code className="rounded-lg bg-bg px-4 py-2 font-mono text-sm text-text tracking-wider">
            {household.inviteCode}
          </code>
          <button onClick={handleCopyInvite} className={btnSecondary}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {household.inviteCodeExpiresAt && (
          <p className="mt-2 text-xs text-text-muted">
            Expires{" "}
            {new Date(household.inviteCodeExpiresAt).toLocaleDateString()}
          </p>
        )}
      </section>

      {/* 4. Grocery Stores */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Grocery Stores
        </h2>

        {/* Store checkboxes */}
        <div className="mb-4 flex flex-wrap gap-3">
          {ALL_STORES.map((store) => (
            <label
              key={store}
              className="flex items-center gap-2 text-sm text-text"
            >
              <input
                type="checkbox"
                checked={household.groceryStores.includes(store)}
                onChange={() => toggleStore(store)}
                className="rounded border-border text-primary focus:ring-primary-light"
              />
              {STORE_LABELS[store]}
            </label>
          ))}
        </div>

        {/* Selected store order */}
        {household.groceryStores.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wide">
              Store Order
            </p>
            <ul className="space-y-1">
              {household.groceryStores.map((store, i) => (
                <li
                  key={store}
                  className="flex items-center gap-2 rounded-lg border border-border-light px-3 py-1.5 text-sm text-text"
                >
                  <span className="flex-1">{STORE_LABELS[store]}</span>
                  <button
                    onClick={() => moveStore(i, -1)}
                    disabled={i === 0}
                    className={arrowBtnClass}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveStore(i, 1)}
                    disabled={i === household.groceryStores.length - 1}
                    className={arrowBtnClass}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Default store */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary uppercase tracking-wide">
            Default Store
          </label>
          <select
            value={household.defaultStore}
            onChange={(e) =>
              updateHousehold("defaultStore", e.target.value as StoreName)
            }
            className={`${inputClass} w-full max-w-xs`}
          >
            {household.groceryStores.map((store) => (
              <option key={store} value={store}>
                {STORE_LABELS[store]}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 5. Meal Schedule */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Meal Schedule
        </h2>
        <p className="mb-3 text-sm text-text-muted">
          Meals per week for each type.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ALL_MEAL_TYPES.map((meal) => (
            <div key={meal}>
              <label className="mb-1 block text-xs font-medium text-text-secondary uppercase tracking-wide">
                {MEAL_TYPE_LABELS[meal]}
              </label>
              <input
                type="number"
                min={0}
                max={14}
                value={household.mealSchedule[meal]}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(14, Number(e.target.value)));
                  updateHousehold("mealSchedule", {
                    ...household.mealSchedule,
                    [meal]: val,
                  } as MealSchedule);
                }}
                className={`${inputClass} w-full`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 6. Default Servings */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Default Servings
        </h2>
        <input
          type="number"
          min={1}
          max={12}
          value={household.defaultServings}
          onChange={(e) => {
            const val = Math.max(1, Math.min(12, Number(e.target.value)));
            updateHousehold("defaultServings", val);
          }}
          className={`${inputClass} w-24`}
        />
      </section>

      {/* 7. Dietary Preferences */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Dietary Preferences
        </h2>
        <div className="flex flex-wrap gap-3">
          {DIETARY_OPTIONS.map((pref) => (
            <label
              key={pref}
              className="flex items-center gap-2 text-sm text-text capitalize"
            >
              <input
                type="checkbox"
                checked={household.dietaryPreferences.includes(pref)}
                onChange={() => {
                  const prefs = household.dietaryPreferences.includes(pref)
                    ? household.dietaryPreferences.filter((p) => p !== pref)
                    : [...household.dietaryPreferences, pref];
                  updateHousehold("dietaryPreferences", prefs);
                }}
                className="rounded border-border text-primary focus:ring-primary-light"
              />
              {pref}
            </label>
          ))}
        </div>
      </section>

      {/* 8. Grocery Categories */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Grocery Categories
        </h2>
        <p className="mb-3 text-sm text-text-muted">
          Categories for organizing your grocery list. Reorder and assign
          ingredient types to each.
        </p>

        <ul className="space-y-2">
          {household.groceryCategories.map((cat, i) => {
            const isExpanded = expandedCategory === i;
            return (
              <li
                key={i}
                className="rounded-lg border border-border-light"
              >
                {/* Header */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() =>
                      setExpandedCategory(isExpanded ? null : i)
                    }
                    className="flex-1 text-left text-sm font-medium text-text"
                  >
                    <span>{cat.name}</span>
                    <span className="ml-2 text-xs text-text-muted">
                      ({cat.ingredientTypes.length} types)
                    </span>
                  </button>
                  <button
                    onClick={() => moveCategoryItem(i, -1)}
                    disabled={i === 0}
                    className={arrowBtnClass}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveCategoryItem(i, 1)}
                    disabled={i === household.groceryCategories.length - 1}
                    className={arrowBtnClass}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => removeCategory(i)}
                    className="rounded-md px-2 py-0.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                    aria-label="Remove category"
                  >
                    ✕
                  </button>
                </div>

                {/* Expanded edit panel */}
                {isExpanded && (
                  <div className="border-t border-border-light px-3 py-3">
                    <label className="mb-2 block text-xs font-medium text-text-secondary uppercase tracking-wide">
                      Category Name
                    </label>
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) =>
                        updateCategory(i, { name: e.target.value })
                      }
                      className={`${inputClass} mb-3 w-full max-w-xs`}
                    />
                    <label className="mb-2 block text-xs font-medium text-text-secondary uppercase tracking-wide">
                      Ingredient Types
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_INGREDIENT_CATEGORIES.map((ingCat) => (
                        <label
                          key={ingCat}
                          className="flex items-center gap-1.5 text-xs text-text"
                        >
                          <input
                            type="checkbox"
                            checked={cat.ingredientTypes.includes(ingCat)}
                            onChange={() =>
                              toggleCategoryIngredient(i, ingCat)
                            }
                            className="rounded border-border text-primary focus:ring-primary-light"
                          />
                          {CATEGORY_LABELS[ingCat]}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <button onClick={addCategory} className={`${btnSecondary} mt-3`}>
          + Add Category
        </button>
      </section>

      {/* 9. Nutrition Priorities */}
      <section className={cardClass}>
        <h2 className="font-display mb-4 text-lg font-semibold text-text">
          Nutrition Priorities
        </h2>
        <p className="mb-3 text-sm text-text-muted">
          Select nutrients to track and reorder by priority.
        </p>

        {/* Nutrient checkboxes */}
        <div className="mb-4 flex flex-wrap gap-3">
          {ALL_NUTRIENTS.map((nutrient) => {
            const isEnabled = household.nutritionPriorities.some(
              (p) => p.nutrient === nutrient
            );
            return (
              <label
                key={nutrient}
                className="flex items-center gap-2 text-sm text-text"
              >
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => toggleNutrient(nutrient)}
                  className="rounded border-border text-primary focus:ring-primary-light"
                />
                {NUTRITION_LABELS[nutrient]}
              </label>
            );
          })}
        </div>

        {/* Priority order list */}
        {household.nutritionPriorities.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wide">
              Display Order
            </p>
            <ul className="space-y-1">
              {household.nutritionPriorities.map((priority, i) => (
                <li
                  key={priority.nutrient}
                  className="flex items-center gap-2 rounded-lg border border-border-light px-3 py-1.5 text-sm text-text"
                >
                  <span className="w-6 text-center text-xs font-medium text-text-muted">
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    {NUTRITION_LABELS[priority.nutrient]}
                  </span>
                  <button
                    onClick={() => moveNutrient(i, -1)}
                    disabled={i === 0}
                    className={arrowBtnClass}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveNutrient(i, 1)}
                    disabled={
                      i === household.nutritionPriorities.length - 1
                    }
                    className={arrowBtnClass}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
