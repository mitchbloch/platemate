import { describe, expect, it } from "vitest";
import { matchesRecipeQuery, normalizeSearchText } from "../recipeSearch";
import type { Recipe } from "../types";

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    householdId: "h1",
    title: "Thai Green Curry",
    sourceUrl: null,
    sourceName: null,
    description: "A weeknight favourite",
    cuisine: "asian",
    mealType: "dinner",
    difficulty: "easy",
    servings: 4,
    totalTimeMinutes: 30,
    ingredients: [
      { name: "chicken thighs", quantity: 1, unit: "lb", preparation: null, category: "meat", raw: "1 lb chicken thighs" },
      { name: "coconut milk", quantity: 1, unit: "can", preparation: null, category: "canned", raw: "1 can coconut milk" },
    ],
    instructions: ["Cook"],
    nutrition: null,
    dietaryFlags: [],
    tags: ["quick", "one-pot"],
    imageUrl: null,
    isSlowCooker: false,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("matchesRecipeQuery", () => {
  it("matches everything on an empty or whitespace query", () => {
    expect(matchesRecipeQuery(recipe(), "")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "   ")).toBe(true);
  });

  it("matches title substrings case-insensitively", () => {
    expect(matchesRecipeQuery(recipe(), "green")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "CURRY")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "pizza")).toBe(false);
  });

  it("requires every token to match, in any order", () => {
    expect(matchesRecipeQuery(recipe(), "curry thai")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "thai pizza")).toBe(false);
  });

  it("matches cuisine and meal type by their display labels", () => {
    expect(matchesRecipeQuery(recipe(), "asian")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "dinner")).toBe(true);
    expect(matchesRecipeQuery(recipe({ cuisine: "middle-eastern" }), "middle eastern")).toBe(true);
  });

  it("matches tags and ingredient names (the fridge-planning case)", () => {
    expect(matchesRecipeQuery(recipe(), "one-pot")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "chicken")).toBe(true);
    expect(matchesRecipeQuery(recipe(), "coconut chicken")).toBe(true);
  });

  it("does not match the description or raw ingredient lines", () => {
    expect(matchesRecipeQuery(recipe(), "weeknight")).toBe(false);
    expect(matchesRecipeQuery(recipe({ ingredients: [{ name: "onion", quantity: 1, unit: null, preparation: null, category: "produce", raw: "1 large yellow onion" }] }), "yellow")).toBe(false);
  });

  it("ignores diacritics in both the query and the recipe", () => {
    expect(matchesRecipeQuery(recipe({ title: "Crème Brûlée" }), "creme brulee")).toBe(true);
    expect(matchesRecipeQuery(recipe({ title: "Jalapeno Poppers" }), "jalapeño")).toBe(true);
  });
});

describe("normalizeSearchText", () => {
  it("lowercases, strips accents, collapses whitespace", () => {
    expect(normalizeSearchText("  Crème   Brûlée ")).toBe("creme brulee");
  });
});
