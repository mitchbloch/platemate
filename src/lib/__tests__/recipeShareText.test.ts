import { describe, expect, it } from "vitest";
import { formatRecipeAsText } from "../recipeShareText";
import type { SharedRecipe } from "../types";

const recipe: SharedRecipe["recipe"] = {
  title: "Shrimp Tacos",
  description: "Weeknight favourite.",
  cuisine: "mexican",
  mealType: "dinner",
  difficulty: "easy",
  servings: 4,
  totalTimeMinutes: 25,
  ingredients: [
    { name: "shrimp", quantity: 1, unit: "lb", preparation: "peeled", category: "seafood", raw: "1 lb shrimp, peeled" },
    { name: "lime", quantity: 1, unit: null, preparation: null, category: "produce", raw: "" },
  ],
  instructions: ["Season the shrimp.", "Cook 2 minutes per side."],
  nutrition: null,
  dietaryFlags: [],
  tags: [],
  imageUrl: null,
  isSlowCooker: false,
  sourceUrl: "https://example.com/tacos",
  sourceName: "Example",
};

describe("formatRecipeAsText", () => {
  it("produces a paste-ready recipe with source and share link", () => {
    expect(formatRecipeAsText(recipe, "https://platemate.app/r/abc")).toBe(
      [
        "Shrimp Tacos",
        "Mexican · Dinner · 4 servings · 25 min",
        "",
        "Weeknight favourite.",
        "",
        "Ingredients",
        "- 1 lb shrimp, peeled",
        "- 1 lime",
        "",
        "Instructions",
        "1. Season the shrimp.",
        "2. Cook 2 minutes per side.",
        "",
        "Source: https://example.com/tacos",
        "",
        "Shared from Platemate: https://platemate.app/r/abc",
      ].join("\n"),
    );
  });

  it("omits empty sections", () => {
    const text = formatRecipeAsText({ ...recipe, description: null, sourceUrl: null, totalTimeMinutes: null, isSlowCooker: true });
    expect(text).toContain("Mexican · Dinner · 4 servings · Slow cooker");
    expect(text).not.toContain("Source:");
    expect(text).not.toContain("Shared from");
  });
});
