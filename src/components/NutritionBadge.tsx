import type { NutritionInfo } from "@/lib/types";
import { NUTRITION_THRESHOLDS } from "@/lib/types";

type FlagLevel = "ok" | "warning" | "danger";

function getFlag(value: number, thresholds: { warning: number; danger: number }): FlagLevel {
  if (value >= thresholds.danger) return "danger";
  if (value >= thresholds.warning) return "warning";
  return "ok";
}

const FLAG_STYLES: Record<FlagLevel, string> = {
  ok: "bg-accent-light text-accent",
  warning: "bg-gold-light text-gold",
  danger: "bg-danger-light text-danger",
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
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${FLAG_STYLES[cholesterolFlag]}`}>
            Chol {nutrition.cholesterol}mg
          </span>
        )}
        {satFatFlag !== "ok" && (
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${FLAG_STYLES[satFatFlag]}`}>
            Sat Fat {nutrition.saturatedFat}g
          </span>
        )}
        {sodiumFlag !== "ok" && (
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${FLAG_STYLES[sodiumFlag]}`}>
            Na {nutrition.sodium}mg
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-warm">
      <h3 className="mb-3 text-sm font-medium text-text-muted">
        Nutrition (per serving, estimated)
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <div className="font-semibold text-text">{nutrition.calories}</div>
          <div className="text-text-muted">cal</div>
        </div>
        <div>
          <div className="font-semibold text-text">{nutrition.protein}g</div>
          <div className="text-text-muted">protein</div>
        </div>
        <div>
          <div className="font-semibold text-text">{nutrition.carbs}g</div>
          <div className="text-text-muted">carbs</div>
        </div>
        <div>
          <div className="font-semibold text-text">{nutrition.fat}g</div>
          <div className="text-text-muted">fat</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${FLAG_STYLES[cholesterolFlag]}`}>
          Cholesterol: {nutrition.cholesterol}mg
        </span>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${FLAG_STYLES[satFatFlag]}`}>
          Sat Fat: {nutrition.saturatedFat}g
        </span>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${FLAG_STYLES[sodiumFlag]}`}>
          Sodium: {nutrition.sodium}mg
        </span>
        <span className="rounded-md bg-border-light px-2 py-1 text-xs text-text-secondary">
          Fiber: {nutrition.fiber}g
        </span>
      </div>
    </div>
  );
}
