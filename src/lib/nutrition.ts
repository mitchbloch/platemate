import type { NutritionInfo } from "./types";
import { NUTRITION_THRESHOLDS, DAILY_LIMITS } from "./types";

export type FlagLevel = "ok" | "warning" | "danger";

export interface NutritionFlag {
  nutrient: string;
  level: FlagLevel;
  value: number;
  unit: string;
  threshold: number;
  message: string;
}

/** Check a single nutrient against thresholds */
function checkNutrient(
  name: string,
  value: number,
  unit: string,
  thresholds: { warning: number; danger: number },
): NutritionFlag | null {
  if (value >= thresholds.danger) {
    return {
      nutrient: name,
      level: "danger",
      value,
      unit,
      threshold: thresholds.danger,
      message: `High ${name.toLowerCase()}: ${value}${unit} per serving`,
    };
  }
  if (value >= thresholds.warning) {
    return {
      nutrient: name,
      level: "warning",
      value,
      unit,
      threshold: thresholds.warning,
      message: `Moderate ${name.toLowerCase()}: ${value}${unit} per serving`,
    };
  }
  return null;
}

/** Get all nutrition flags for a recipe */
export function getNutritionFlags(nutrition: NutritionInfo): NutritionFlag[] {
  const flags: NutritionFlag[] = [];

  const cholFlag = checkNutrient("Cholesterol", nutrition.cholesterol, "mg", NUTRITION_THRESHOLDS.cholesterol);
  if (cholFlag) flags.push(cholFlag);

  const satFatFlag = checkNutrient("Saturated fat", nutrition.saturatedFat, "g", NUTRITION_THRESHOLDS.saturatedFat);
  if (satFatFlag) flags.push(satFatFlag);

  const sodiumFlag = checkNutrient("Sodium", nutrition.sodium, "mg", NUTRITION_THRESHOLDS.sodium);
  if (sodiumFlag) flags.push(sodiumFlag);

  return flags;
}

/** Summarize weekly nutrition from an array of per-serving nutrition entries */
export function weeklyNutritionSummary(
  meals: { nutrition: NutritionInfo; servings: number }[],
): {
  totalCholesterol: number;
  totalSaturatedFat: number;
  totalSodium: number;
  avgCholesterolPerMeal: number;
  avgSaturatedFatPerMeal: number;
  dailyCholesterolEstimate: number;
  flags: NutritionFlag[];
} {
  const count = meals.length || 1;

  const totalCholesterol = meals.reduce((sum, m) => sum + m.nutrition.cholesterol, 0);
  const totalSaturatedFat = meals.reduce((sum, m) => sum + m.nutrition.saturatedFat, 0);
  const totalSodium = meals.reduce((sum, m) => sum + m.nutrition.sodium, 0);

  // A planned dinner is ~40% of that day's intake (one major meal), so the
  // estimated full-day intake on a planned-meal day is avg-per-meal / 0.4.
  const DINNER_SHARE_OF_DAY = 0.4;
  const avgCholesterolPerMeal = totalCholesterol / count;
  const dailyCholesterolEstimate = avgCholesterolPerMeal / DINNER_SHARE_OF_DAY;

  const flags: NutritionFlag[] = [];

  if (dailyCholesterolEstimate > DAILY_LIMITS.cholesterol) {
    flags.push({
      nutrient: "Weekly cholesterol",
      level: "danger",
      value: totalCholesterol,
      unit: "mg",
      threshold: DAILY_LIMITS.cholesterol * DINNER_SHARE_OF_DAY * count,
      message: `Weekly planned meals contribute ${totalCholesterol}mg cholesterol — consider swapping a high-cholesterol dinner`,
    });
  }

  return {
    totalCholesterol,
    totalSaturatedFat,
    totalSodium,
    avgCholesterolPerMeal,
    avgSaturatedFatPerMeal: totalSaturatedFat / count,
    dailyCholesterolEstimate,
    flags,
  };
}
