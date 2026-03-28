import type { NutritionInfo } from "@/lib/types";
import { weeklyNutritionSummary } from "@/lib/nutrition";

const FLAG_STYLES = {
  ok: "bg-accent-light text-accent",
  warning: "bg-gold-light text-gold",
  danger: "bg-danger-light text-danger",
} as const;

export default function WeeklyNutritionSummary({
  meals,
}: {
  meals: Array<{ nutrition: NutritionInfo | null; servings: number }>;
}) {
  const mealsWithNutrition = meals.filter(
    (m): m is { nutrition: NutritionInfo; servings: number } => m.nutrition !== null,
  );

  if (mealsWithNutrition.length === 0) return null;

  const summary = weeklyNutritionSummary(mealsWithNutrition);
  const totalCalories = mealsWithNutrition.reduce(
    (sum, m) => sum + m.nutrition.calories,
    0,
  );
  const totalProtein = mealsWithNutrition.reduce(
    (sum, m) => sum + m.nutrition.protein,
    0,
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-warm">
      <h3 className="mb-3 text-sm font-medium text-text-muted">
        Weekly Nutrition Summary
        {mealsWithNutrition.length < meals.length && (
          <span className="ml-2 text-xs text-text-muted">
            ({mealsWithNutrition.length} of {meals.length} meals have nutrition data)
          </span>
        )}
      </h3>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div>
          <div className="font-semibold text-text">{totalCalories}</div>
          <div className="text-text-muted">total cal</div>
        </div>
        <div>
          <div className="font-semibold text-text">{totalProtein}g</div>
          <div className="text-text-muted">total protein</div>
        </div>
        <div>
          <div className="font-semibold text-text">{summary.totalCholesterol}mg</div>
          <div className="text-text-muted">cholesterol</div>
        </div>
        <div>
          <div className="font-semibold text-text">{summary.totalSaturatedFat}g</div>
          <div className="text-text-muted">sat fat</div>
        </div>
        <div>
          <div className="font-semibold text-text">{summary.totalSodium}mg</div>
          <div className="text-text-muted">sodium</div>
        </div>
      </div>

      {summary.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.flags.map((flag, i) => (
            <span
              key={i}
              className={`rounded-md px-2 py-1 text-xs font-medium ${FLAG_STYLES[flag.level]}`}
            >
              {flag.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
