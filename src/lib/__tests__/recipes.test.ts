import { describe, expect, it } from "vitest";
import { rowToRecipe } from "../recipes";

describe("rowToRecipe", () => {
  it("converts every snake_case column to the Recipe shape", () => {
    // Regression: pages that skipped this converter rendered undefined for
    // mealType/totalTimeMinutes/isSlowCooker/sourceUrl — "edits don't save".
    const recipe = rowToRecipe({
      id: "r1",
      household_id: "h1",
      title: "Tacos",
      source_url: "https://example.com",
      source_name: "Example",
      description: null,
      cuisine: "mexican",
      meal_type: "dinner",
      difficulty: "easy",
      servings: 4,
      total_time_minutes: 25,
      ingredients: [],
      instructions: ["x"],
      nutrition: null,
      dietary_flags: null,
      tags: ["a"],
      image_url: null,
      is_slow_cooker: true,
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    });
    expect(recipe).toEqual({
      id: "r1",
      householdId: "h1",
      title: "Tacos",
      sourceUrl: "https://example.com",
      sourceName: "Example",
      description: null,
      cuisine: "mexican",
      mealType: "dinner",
      difficulty: "easy",
      servings: 4,
      totalTimeMinutes: 25,
      ingredients: [],
      instructions: ["x"],
      nutrition: null,
      dietaryFlags: [],
      tags: ["a"],
      imageUrl: null,
      isSlowCooker: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    });
    // Nothing snake_case leaks through
    expect(Object.keys(recipe).some((k) => k.includes("_"))).toBe(false);
  });
});
