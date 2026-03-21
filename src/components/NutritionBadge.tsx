import type { NutritionInfo } from "@/lib/types";
import { NUTRITION_THRESHOLDS } from "@/lib/types";

type FlagLevel = "ok" | "warning" | "danger";

function getFlag(value: number, thresholds: { warning: number; danger: number }): FlagLevel {
  if (value >= thresholds.danger) return "danger";
  if (value >= thresholds.warning) return "warning";
  return "ok";
}

const FLAG_STYLES: Record<FlagLevel, string> = {
  ok: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export default function NutritionBadge({
  nutrition,
  compact = false,
}: {
  nutrition: NutritionInfo;
  compact?: boolean;
}) {
  const cholesterolFlag = getFlag(nutrition.cholesterol, NUTRITION_THRESHOLDS.cholesterol);
  const satFatFlag = getFlag(nutrition.saturatedFat, NUTRITION_THRESHOLDS.saturatedFat);
  const sodiumFlag = getFlag(nutrition.sodium, NUTRITION_THRESHOLDS.sodium);

  if (compact) {
    const hasWarning = cholesterolFlag !== "ok" || satFatFlag !== "ok" || sodiumFlag !== "ok";
    if (!hasWarning) return null;

    return (
      <div className="flex gap-1">
        {cholesterolFlag !== "ok" && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${FLAG_STYLES[cholesterolFlag]}`}>
            Chol {nutrition.cholesterol}mg
          </span>
        )}
        {satFatFlag !== "ok" && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${FLAG_STYLES[satFatFlag]}`}>
            Sat Fat {nutrition.saturatedFat}g
          </span>
        )}
        {sodiumFlag !== "ok" && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${FLAG_STYLES[sodiumFlag]}`}>
            Na {nutrition.sodium}mg
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-500">
        Nutrition (per serving, estimated)
      </h3>
      <div className="grid grid-cols-4 gap-3 text-sm">
        <div>
          <div className="font-semibold text-gray-900">{nutrition.calories}</div>
          <div className="text-gray-500">cal</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{nutrition.protein}g</div>
          <div className="text-gray-500">protein</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{nutrition.carbs}g</div>
          <div className="text-gray-500">carbs</div>
        </div>
        <div>
          <div className="font-semibold text-gray-900">{nutrition.fat}g</div>
          <div className="text-gray-500">fat</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded px-2 py-1 text-xs font-medium ${FLAG_STYLES[cholesterolFlag]}`}>
          Cholesterol: {nutrition.cholesterol}mg
        </span>
        <span className={`rounded px-2 py-1 text-xs font-medium ${FLAG_STYLES[satFatFlag]}`}>
          Sat Fat: {nutrition.saturatedFat}g
        </span>
        <span className={`rounded px-2 py-1 text-xs font-medium ${FLAG_STYLES[sodiumFlag]}`}>
          Sodium: {nutrition.sodium}mg
        </span>
        <span className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">
          Fiber: {nutrition.fiber}g
        </span>
      </div>
    </div>
  );
}
