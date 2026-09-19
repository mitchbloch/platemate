import { describe, expect, it } from "vitest";
import {
  buildSystemBlocks,
  householdContext,
  libraryDigest,
  toApiMessages,
  userTurnContent,
  validateGenerateRequest,
  validateGenerationResponse,
} from "../recipeGeneration";
import type { GenerationMessage, ParsedRecipe } from "../types";

const household = {
  defaultServings: 2,
  dietaryPreferences: ["gluten-free"],
  nutritionPriorities: [
    { nutrient: "saturatedFat" as const, rank: 2 },
    { nutrient: "cholesterol" as const, rank: 1 },
  ],
};
const library = [
  { id: "b", title: "Lentil Soup", ingredients: [{ name: "lentils", quantity: 1, unit: "cup", preparation: null, category: "grain" as const, raw: "" }] },
  { id: "a", title: "Chicken Tacos", ingredients: [{ name: "FAGE yogurt", shoppingName: "greek yogurt", quantity: 1, unit: "cup", preparation: null, category: "dairy" as const, raw: "" }] },
];
const draft: ParsedRecipe = {
  title: "Yogurt Chicken", description: null, cuisine: "mediterranean", mealType: "dinner", difficulty: "easy", servings: 2,
  totalTimeMinutes: 30, ingredients: [{ name: "chicken thighs", quantity: 1, unit: "lb", preparation: null, category: "meat", raw: "1 lb chicken thighs", shoppingName: "chicken thighs" }],
  instructions: ["Marinate", "Grill"], nutrition: { calories: 400, protein: 40, carbs: 5, fat: 20, saturatedFat: 5, cholesterol: 150, fiber: 0, sodium: 500 },
  dietaryFlags: ["gluten-free"], tags: [], imageUrl: "https://x/y.jpg", isSlowCooker: false, sourceName: "whatever",
};

describe("householdContext", () => {
  it("states servings, hard dietary constraints, and ranked nutrition priorities", () => {
    const text = householdContext(household);
    expect(text).toContain("Default servings: 2");
    expect(text).toContain("gluten-free");
    expect(text).toContain("Cholesterol, Saturated Fat");
  });
});

describe("libraryDigest", () => {
  it("is deterministic (sorted by id) and prefers shopping names", () => {
    const digest = libraryDigest(library);
    expect(digest.split("\n").slice(1)).toEqual(["a | Chicken Tacos | greek yogurt", "b | Lentil Soup | lentils"]);
    expect(libraryDigest([])).toMatch(/empty/);
  });

  it("goes in the last system block with the cache breakpoint", () => {
    const blocks = buildSystemBlocks(household, library);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].text).toContain("Chicken Tacos");
  });
});

describe("toApiMessages", () => {
  it("replays photo turns as a marker with what was seen, and assistant turns as their JSON", () => {
    const history: GenerationMessage[] = [
      { role: "user", content: "What can I make?", photoCount: 2, seenIngredients: ["eggs", "spinach"], at: "" },
      { role: "assistant", reply: "A few ideas", options: [{ title: "Frittata", summary: "Quick" }], recipe: null, libraryMatches: [{ recipeId: "a", title: "Chicken Tacos", reason: "uses yogurt" }], at: "" },
    ];
    const msgs = toApiMessages(history);
    expect(msgs[0]).toEqual({ role: "user", content: "What can I make?\n\n[2 photos attached earlier. Ingredients seen: eggs, spinach]" });
    expect(msgs[1].role).toBe("assistant");
    const replayed = JSON.parse(msgs[1].content as string);
    expect(replayed.options[0].title).toBe("Frittata");
    expect(replayed.libraryMatches).toEqual([{ recipeId: "a", reason: "uses yogurt" }]);
  });

  it("puts images before the text in the current turn", () => {
    const content = userTurnContent("use these", ["AAAA"]);
    expect(Array.isArray(content) && content[0].type).toBe("image");
    expect(userTurnContent("plain", [])).toBe("plain");
  });
});

describe("validateGenerationResponse", () => {
  it("keeps a valid draft, stamps the source, and drops options when a recipe is present", () => {
    const result = validateGenerationResponse({ reply: "Here you go", options: [{ title: "x", summary: "y" }], recipe: draft, libraryMatches: [], seenIngredients: [] }, library);
    expect(result.recipe?.title).toBe("Yogurt Chicken");
    expect(result.recipe?.sourceName).toBe("Generated with Platemate");
    expect(result.recipe?.imageUrl).toBeNull();
    expect(result.options).toBeNull();
  });

  it("filters library matches to real ids, dedups, attaches titles, and caps at 5", () => {
    const result = validateGenerationResponse({
      reply: "ok", options: null, recipe: null, seenIngredients: [],
      libraryMatches: [
        { recipeId: "a", reason: "yes" }, { recipeId: "ghost", reason: "no" }, { recipeId: "a", reason: "dup" },
        { recipeId: "b", reason: "soup" },
      ],
    }, library);
    expect(result.libraryMatches).toEqual([
      { recipeId: "a", reason: "yes", title: "Chicken Tacos" },
      { recipeId: "b", reason: "soup", title: "Lentil Soup" },
    ]);
  });

  it("drops an invalid recipe instead of failing the turn", () => {
    const result = validateGenerationResponse({ reply: "Almost", options: null, recipe: { title: "" }, libraryMatches: [], seenIngredients: [] }, library);
    expect(result.recipe).toBeNull();
    expect(result.reply).toBe("Almost");
  });

  it("caps options at 3 and normalizes seen ingredients", () => {
    const result = validateGenerationResponse({
      reply: "", options: [1, 2, 3, 4].map((n) => ({ title: `Idea ${n}`, summary: "" })), recipe: null, libraryMatches: [],
      seenIngredients: [" Eggs ", "", "spinach"],
    }, library);
    expect(result.options).toHaveLength(3);
    expect(result.seenIngredients).toEqual(["eggs", "spinach"]);
    expect(result.reply).toBe("Here are some directions.");
  });

  it("rejects an answer with nothing in it", () => {
    expect(() => validateGenerationResponse({ reply: "", options: null, recipe: null, libraryMatches: [], seenIngredients: [] }, library)).toThrow();
  });
});

describe("validateGenerateRequest", () => {
  it("requires a message or a photo, and bounds sizes", () => {
    expect(validateGenerateRequest({ message: " " }).ok).toBe(false);
    expect(validateGenerateRequest({ message: "", images: ["QUJD"] })).toEqual({ ok: true, request: { generationId: null, message: "(see photo)", images: ["QUJD"] } });
    expect(validateGenerateRequest({ message: "x".repeat(4001) }).ok).toBe(false);
    expect(validateGenerateRequest({ message: "hi", images: ["QUJD", "QUJD", "QUJD", "QUJD"] }).ok).toBe(false);
    expect(validateGenerateRequest({ message: "hi", images: ["not base64!"] }).ok).toBe(false);
    expect(validateGenerateRequest({ message: "hi", images: ["A".repeat(600_001)] }).ok).toBe(false);
    expect(validateGenerateRequest({ message: "hi", generationId: "g1" })).toEqual({ ok: true, request: { generationId: "g1", message: "hi", images: [] } });
  });
});
