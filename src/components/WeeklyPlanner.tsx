"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Recipe, MealPlan, MealPlanRecipe, CuisineType, MealType } from "@/lib/types";
import { CUISINE_LABELS } from "@/lib/types";
import { suggestRecipes } from "@/lib/recommendations";
import NutritionBadge from "./NutritionBadge";
import WeeklyNutritionSummary from "./WeeklyNutritionSummary";

type MealWithRecipe = MealPlanRecipe & { recipe: Recipe };

interface WeeklyPlannerProps {
  initialRecipes: Recipe[];
  initialPlan: MealPlan | null;
  initialMeals: MealWithRecipe[];
  initialWeekStart: string;
  lastCookedDates: Record<string, string>;
}

/** Format a week start date as "Week of Mar 23" */
function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Shift a week start by N weeks */
function shiftWeek(weekStart: string, weeks: number): string {
  const date = new Date(weekStart + "T00:00:00");
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split("T")[0];
}

/** Get Sunday of current week */
function getCurrentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

export default function WeeklyPlanner({
  initialRecipes,
  initialPlan,
  initialMeals,
  initialWeekStart,
  lastCookedDates: initialLastCookedDates,
}: WeeklyPlannerProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [plan, setPlan] = useState<MealPlan | null>(initialPlan);
  const [meals, setMeals] = useState<MealWithRecipe[]>(initialMeals);
  const [recipes] = useState<Recipe[]>(initialRecipes);
  const [lastCookedDates, setLastCookedDates] = useState(initialLastCookedDates);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // recipeId being added

  // Recipe picker filters
  const [filterCuisine, setFilterCuisine] = useState<CuisineType | "all">("all");
  const [filterMealType, setFilterMealType] = useState<MealType | "all">("all");

  // Completion flow
  const [showCompletePrompt, setShowCompletePrompt] = useState(false);
  const [completeMeals, setCompleteMeals] = useState<MealWithRecipe[]>([]);
  const [checkedRecipeIds, setCheckedRecipeIds] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);

  const currentWeekStart = getCurrentWeekStart();
  const isCurrentWeek = weekStart === currentWeekStart;
  const isPastWeek = weekStart < currentWeekStart;

  // Group meals by type
  const dinners = meals.filter((m) => m.mealType === "dinner");
  const slowCookerLunches = meals.filter((m) => m.mealType === "slow-cooker-lunch");
  const currentPlanRecipeIds = useMemo(
    () => new Set(meals.map((m) => m.recipeId)),
    [meals],
  );
  const currentPlanCuisines = useMemo(
    () => meals.map((m) => m.recipe.cuisine),
    [meals],
  );

  // Suggestions
  const suggestions = useMemo(
    () => suggestRecipes(recipes, lastCookedDates, currentPlanRecipeIds, currentPlanCuisines),
    [recipes, lastCookedDates, currentPlanRecipeIds, currentPlanCuisines],
  );

  // Filtered recipes for picker
  const filteredRecipes = useMemo(() => {
    return suggestions.filter((s) => {
      if (filterCuisine !== "all" && s.recipe.cuisine !== filterCuisine) return false;
      if (filterMealType !== "all" && s.recipe.mealType !== filterMealType) return false;
      return true;
    });
  }, [suggestions, filterCuisine, filterMealType]);

  // Top suggestions for the banner
  const topSuggestions = suggestions.slice(0, 3);

  // ── Data Fetching ──

  const fetchWeekData = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meal-plans?week=${week}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPlan(data.plan);
      setMeals(data.meals);
    } catch {
      setPlan(null);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkPreviousWeek = useCallback(async (prevWeek: string) => {
    try {
      const res = await fetch(`/api/meal-plans?week=${prevWeek}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.plan && data.meals.length > 0) {
        // Check if already logged
        const historyRes = await fetch("/api/recipe-history");
        if (historyRes.ok) {
          const history: Record<string, string> = await historyRes.json();
          const alreadyLogged = data.meals.every(
            (m: MealWithRecipe) => history[m.recipeId] === prevWeek,
          );
          if (!alreadyLogged) {
            setCompleteMeals(data.meals);
            setCheckedRecipeIds(new Set(data.meals.map((m: MealWithRecipe) => m.recipeId)));
            setShowCompletePrompt(true);
          }
        }
      }
    } catch {
      // Silently fail — completion prompt is not critical
    }
  }, []);

  // ── Navigation ──

  async function navigateWeek(direction: number) {
    const newWeek = shiftWeek(weekStart, direction);
    setWeekStart(newWeek);
    setShowPicker(false);
    setShowCompletePrompt(false);
    await fetchWeekData(newWeek);

    // Check if previous week needs completion (only when navigating forward)
    if (direction > 0) {
      await checkPreviousWeek(weekStart);
    }
  }

  async function goToCurrentWeek() {
    setWeekStart(currentWeekStart);
    setShowPicker(false);
    setShowCompletePrompt(false);
    await fetchWeekData(currentWeekStart);
  }

  // ── Add/Remove Meals ──

  async function addMeal(recipe: Recipe) {
    setAdding(recipe.id);
    try {
      const res = await fetch("/api/meal-plans/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          recipeId: recipe.id,
          mealType: recipe.mealType,
        }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const data = await res.json();

      // Optimistic update
      if (!plan) {
        setPlan({
          id: data.planId,
          weekStart,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      setMeals((prev) => [
        ...prev,
        {
          id: data.id,
          mealPlanId: data.planId,
          recipeId: recipe.id,
          dayOfWeek: 0,
          mealType: recipe.mealType,
          servingsOverride: null,
          recipe,
        },
      ]);
    } catch {
      alert("Failed to add meal");
    } finally {
      setAdding(null);
    }
  }

  async function removeMeal(mealPlanRecipe: MealWithRecipe) {
    // Optimistic removal
    setMeals((prev) => prev.filter((m) => m.id !== mealPlanRecipe.id));

    try {
      const res = await fetch(
        `/api/meal-plans/${mealPlanRecipe.mealPlanId}/recipes/${mealPlanRecipe.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      // Revert on failure
      setMeals((prev) => [...prev, mealPlanRecipe]);
      alert("Failed to remove meal");
    }
  }

  // ── Complete Week ──

  async function completeWeek() {
    if (!completeMeals.length) return;
    setCompleting(true);

    // Find the plan ID from the complete meals
    const planId = completeMeals[0].mealPlanId;

    try {
      const res = await fetch(`/api/meal-plans/${planId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeIds: Array.from(checkedRecipeIds),
        }),
      });
      if (!res.ok) throw new Error("Failed to complete");
      const data = await res.json();

      // Refresh last cooked dates
      const historyRes = await fetch("/api/recipe-history");
      if (historyRes.ok) {
        setLastCookedDates(await historyRes.json());
      }

      setShowCompletePrompt(false);
      setCompleteMeals([]);
      alert(`Logged ${data.logged} recipe${data.logged === 1 ? "" : "s"} to history!`);
    } catch {
      alert("Failed to log history");
    } finally {
      setCompleting(false);
    }
  }

  function toggleChecked(recipeId: string) {
    setCheckedRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Week Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek(-1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          &larr; Prev
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">
            {formatWeekLabel(weekStart)}
          </h1>
          {!isCurrentWeek && (
            <button
              onClick={goToCurrentWeek}
              className="mt-1 text-xs text-primary hover:text-primary-dark"
            >
              Go to this week
            </button>
          )}
        </div>
        <button
          onClick={() => navigateWeek(1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Next &rarr;
        </button>
      </div>

      {loading && (
        <div className="py-8 text-center text-gray-500">Loading...</div>
      )}

      {/* Incomplete Week Banner */}
      {showCompletePrompt && completeMeals.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 text-sm font-medium text-amber-800">
            Log last week&apos;s meals?
          </h3>
          <p className="mb-3 text-xs text-amber-700">
            Uncheck any meals you didn&apos;t actually cook.
          </p>
          <div className="mb-3 space-y-2">
            {completeMeals.map((meal) => (
              <label key={meal.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checkedRecipeIds.has(meal.recipeId)}
                  onChange={() => toggleChecked(meal.recipeId)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">{meal.recipe.title}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={completeWeek}
              disabled={completing || checkedRecipeIds.size === 0}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {completing ? "Logging..." : `Log ${checkedRecipeIds.size} meal${checkedRecipeIds.size === 1 ? "" : "s"}`}
            </button>
            <button
              onClick={() => setShowCompletePrompt(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Planned Meals */}
          {meals.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="mb-2 text-gray-500">No meals planned yet</p>
              <button
                onClick={() => setShowPicker(true)}
                className="text-sm font-medium text-primary hover:text-primary-dark"
              >
                Pick some meals for the week
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Dinners */}
              {dinners.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-medium text-gray-500">
                    Dinners ({dinners.length})
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dinners.map((meal) => (
                      <MealCard
                        key={meal.id}
                        meal={meal}
                        onRemove={() => removeMeal(meal)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Slow Cooker Lunches */}
              {slowCookerLunches.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-medium text-gray-500">
                    Slow Cooker Lunch ({slowCookerLunches.length})
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {slowCookerLunches.map((meal) => (
                      <MealCard
                        key={meal.id}
                        meal={meal}
                        onRemove={() => removeMeal(meal)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Meals Button */}
          {meals.length > 0 && !showPicker && (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full rounded-lg border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 hover:border-primary hover:text-primary"
            >
              + Add more meals
            </button>
          )}

          {/* Recipe Picker */}
          {showPicker && (
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-900">
                  Add Meals
                </h2>
                <button
                  onClick={() => setShowPicker(false)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Close
                </button>
              </div>

              {/* Filters */}
              <div className="mb-4 flex flex-wrap gap-2">
                <select
                  value={filterCuisine}
                  onChange={(e) => setFilterCuisine(e.target.value as CuisineType | "all")}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Cuisines</option>
                  {Object.entries(CUISINE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <select
                  value={filterMealType}
                  onChange={(e) => setFilterMealType(e.target.value as MealType | "all")}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Types</option>
                  <option value="dinner">Dinner</option>
                  <option value="slow-cooker-lunch">Slow Cooker Lunch</option>
                </select>
              </div>

              {/* Suggestions Banner */}
              {topSuggestions.length > 0 && filterCuisine === "all" && filterMealType === "all" && (
                <div className="mb-4 rounded-lg bg-primary/5 p-3">
                  <h3 className="mb-1.5 text-xs font-medium text-primary">
                    Suggestions
                  </h3>
                  <div className="space-y-1">
                    {topSuggestions.map((s) => (
                      <div
                        key={s.recipe.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700">
                          <span className="font-medium">{s.recipe.title}</span>
                          {" "}
                          <span className="text-xs text-gray-500">
                            &mdash; {s.reason}
                          </span>
                        </span>
                        {!currentPlanRecipeIds.has(s.recipe.id) && (
                          <button
                            onClick={() => addMeal(s.recipe)}
                            disabled={adding === s.recipe.id}
                            className="ml-2 shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                          >
                            {adding === s.recipe.id ? "..." : "Add"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recipe Grid */}
              {filteredRecipes.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  No recipes match your filters.
                  {recipes.length === 0 && (
                    <>
                      {" "}
                      <Link href="/recipes/add" className="text-primary hover:text-primary-dark">
                        Import some recipes first.
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredRecipes.map((suggestion) => {
                    const r = suggestion.recipe;
                    const isPlanned = currentPlanRecipeIds.has(r.id);
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          isPlanned
                            ? "border-gray-100 bg-gray-50 opacity-50"
                            : "border-gray-200 hover:border-primary/30"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {r.title}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            <span className="text-xs text-gray-500">
                              {CUISINE_LABELS[r.cuisine]}
                            </span>
                            {r.isSlowCooker && (
                              <span className="text-xs text-amber-600">
                                Slow Cooker
                              </span>
                            )}
                            {r.totalTimeMinutes && (
                              <span className="text-xs text-gray-400">
                                {r.totalTimeMinutes}min
                              </span>
                            )}
                          </div>
                          {r.nutrition && (
                            <div className="mt-1">
                              <NutritionBadge nutrition={r.nutrition} compact />
                            </div>
                          )}
                          {suggestion.reason && (
                            <div className="mt-0.5 text-xs text-gray-400">
                              {suggestion.reason}
                            </div>
                          )}
                        </div>
                        {isPlanned ? (
                          <span className="ml-2 shrink-0 text-xs text-gray-400">
                            Added
                          </span>
                        ) : (
                          <button
                            onClick={() => addMeal(r)}
                            disabled={adding === r.id}
                            className="ml-2 shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                          >
                            {adding === r.id ? "..." : "Add"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Weekly Nutrition Summary */}
          {meals.length > 0 && (
            <WeeklyNutritionSummary
              meals={meals.map((m) => ({
                nutrition: m.recipe.nutrition,
                servings: m.servingsOverride ?? m.recipe.servings,
              }))}
            />
          )}

          {/* Mark Complete Button (for past/current weeks with meals) */}
          {isPastWeek && meals.length > 0 && !showCompletePrompt && (
            <button
              onClick={() => {
                setCompleteMeals(meals);
                setCheckedRecipeIds(new Set(meals.map((m) => m.recipeId)));
                setShowCompletePrompt(true);
              }}
              className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Log this week&apos;s meals to history
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ──

function MealCard({
  meal,
  onRemove,
}: {
  meal: MealWithRecipe;
  onRemove: () => void;
}) {
  const r = meal.recipe;
  return (
    <div className="group relative rounded-lg border border-gray-200 p-4 hover:border-primary/30">
      <button
        onClick={onRemove}
        className="absolute right-2 top-2 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        title="Remove"
      >
        &times;
      </button>
      <Link href={`/recipes/${r.id}`}>
        <h3 className="mb-1 pr-6 font-medium text-gray-900 hover:text-primary">
          {r.title}
        </h3>
      </Link>
      <div className="flex flex-wrap gap-1.5 text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5">
          {CUISINE_LABELS[r.cuisine]}
        </span>
        {r.isSlowCooker && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
            Slow Cooker
          </span>
        )}
        {r.totalTimeMinutes && <span>{r.totalTimeMinutes} min</span>}
        <span>{meal.servingsOverride ?? r.servings} servings</span>
      </div>
      {r.nutrition && (
        <div className="mt-2">
          <NutritionBadge nutrition={r.nutrition} compact />
        </div>
      )}
    </div>
  );
}
