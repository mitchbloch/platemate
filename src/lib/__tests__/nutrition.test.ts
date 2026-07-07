import { describe, it, expect } from "vitest";
import { getNutritionFlags, weeklyNutritionSummary } from "../nutrition";
import type { NutritionInfo } from "../types";

function makeNutrition(overrides: Partial<NutritionInfo> = {}): NutritionInfo {
  return {
    calories: 500,
    protein: 30,
    carbs: 40,
    fat: 20,
    saturatedFat: 4,
    cholesterol: 80,
    fiber: 5,
    sodium: 500,
    ...overrides,
  };
}

describe("getNutritionFlags", () => {
  it("returns no flags for a clean recipe", () => {
    expect(getNutritionFlags(makeNutrition({ cholesterol: 10, saturatedFat: 1, sodium: 100 }))).toEqual([]);
  });

  it("flags high cholesterol as danger", () => {
    const flags = getNutritionFlags(makeNutrition({ cholesterol: 500 }));
    const chol = flags.find((f) => f.nutrient === "Cholesterol");
    expect(chol?.level).toBe("danger");
  });
});

describe("weeklyNutritionSummary", () => {
  it("computes totals and per-meal averages", () => {
    const summary = weeklyNutritionSummary([
      { nutrition: makeNutrition({ cholesterol: 60, saturatedFat: 2, sodium: 400 }), servings: 2 },
      { nutrition: makeNutrition({ cholesterol: 100, saturatedFat: 6, sodium: 800 }), servings: 2 },
    ]);
    expect(summary.totalCholesterol).toBe(160);
    expect(summary.totalSaturatedFat).toBe(8);
    expect(summary.totalSodium).toBe(1200);
    expect(summary.avgCholesterolPerMeal).toBe(80);
  });

  it("estimates daily intake treating a dinner as 40% of the day", () => {
    const summary = weeklyNutritionSummary([
      { nutrition: makeNutrition({ cholesterol: 100 }), servings: 2 },
    ]);
    // 100mg per meal / 0.4 = 250mg estimated daily
    expect(summary.dailyCholesterolEstimate).toBe(250);
  });

  it("does not flag when estimated daily intake is within the 300mg limit", () => {
    // avg 100mg/meal → estimate 250mg/day < 300mg limit
    const summary = weeklyNutritionSummary([
      { nutrition: makeNutrition({ cholesterol: 100 }), servings: 2 },
    ]);
    expect(summary.flags).toEqual([]);
  });

  it("flags when estimated daily intake exceeds the 300mg limit", () => {
    // avg 150mg/meal → estimate 375mg/day > 300mg limit
    const summary = weeklyNutritionSummary([
      { nutrition: makeNutrition({ cholesterol: 150 }), servings: 2 },
    ]);
    expect(summary.flags).toHaveLength(1);
    expect(summary.flags[0].level).toBe("danger");
  });

  it("handles an empty week without dividing by zero", () => {
    const summary = weeklyNutritionSummary([]);
    expect(summary.totalCholesterol).toBe(0);
    expect(summary.avgCholesterolPerMeal).toBe(0);
    expect(summary.flags).toEqual([]);
  });
});
