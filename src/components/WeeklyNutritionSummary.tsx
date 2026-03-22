import type { NutritionInfo } from "@/lib/types";
import { weeklyNutritionSummary } from "@/lib/nutrition";

const FLAG_STYLES = {
  ok: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
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
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-500">
        Weekly Nutrition Summary
        {mealsWithNutrition.length < meals.length && (
          <span className="ml-2 text-xs text-gray-400">
            ({mealsWithNutrition.length} of {meals.length} meals have nutrition data)
          </span>
        )}
      </h3>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div>
          <div className="font-semibold text-gray-900">{totalCalories}</div>
          <div className="text-gray-500">total cal</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{totalProtein}g</div>
          <div className="text-gray-500">total protein</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{summary.totalCholesterol}mg</div>
          <div className="text-gray-500">cholesterol</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{summary.totalSaturatedFat}g</div>
          <div className="text-gray-500">sat fat</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{summary.totalSodium}mg</div>
          <div className="text-gray-500">sodium</div>
        </div>
      </div>

      {summary.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.flags.map((flag, i) => (
            <span
              key={i}
              className={`rounded px-2 py-1 text-xs font-medium ${FLAG_STYLES[flag.level]}`}
            >
              {flag.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
