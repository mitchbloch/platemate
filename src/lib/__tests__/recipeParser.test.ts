import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportSource } from "../import";

const state = vi.hoisted(() => ({
  response: null as unknown,
  lastRequest: null as Record<string, unknown> | null,
  lastOptions: null as Record<string, unknown> | null,
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: Record<string, unknown>, options: Record<string, unknown>) => {
        state.lastRequest = req;
        state.lastOptions = options;
        return state.response;
      },
    };
  },
}));

import { buildRecipeRequestContent, parseRecipe, parseRecipeFromUserInput } from "../recipeParser";
import { createDeadline, ImportFailure } from "../import/fetchPage";

const recipeJson = (overrides: Record<string, unknown> = {}) => ({
  title: "Sheetpan Chicken Kebabs",
  description: null,
  cuisine: "middle-eastern",
  mealType: "dinner",
  difficulty: "easy",
  servings: 4,
  totalTimeMinutes: 40,
  ingredients: [
    { name: "ground chicken", quantity: 1, unit: "kg", preparation: null, category: "meat", raw: "1kg lean ground chicken", shoppingName: "ground chicken" },
  ],
  instructions: ["Bake at 190°C for 20–25 minutes."],
  nutrition: { calories: 586, protein: 62, carbs: 45, fat: 16, saturatedFat: 4, cholesterol: 150, fiber: 5, sodium: 900 },
  dietaryFlags: [],
  tags: [],
  imageUrl: "https://hallucinated.example/img.jpg",
  isSlowCooker: false,
  sourceName: "TikTok",
  ...overrides,
});

const reply = (data: unknown, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text: JSON.stringify(data) }] });

const source = (overrides: Partial<ImportSource> = {}): ImportSource => ({
  sections: [
    { label: "CAPTION", text: "High Protein Sheetpan Chicken Kebabs! 1kg lean ground chicken..." },
    { label: "TRANSCRIPT", text: "Get your onions, bell pepper and garlic" },
  ],
  images: [],
  sourceName: "TikTok — Panacea Palm",
  imageUrl: null,
  sourceUrl: "https://www.tiktok.com/@panaceapalm/video/7641621946563661078",
  ...overrides,
});

beforeEach(() => {
  state.response = reply(recipeJson());
  state.lastRequest = null;
  state.lastOptions = null;
});

describe("buildRecipeRequestContent", () => {
  it("labels each section and includes the source URL", () => {
    const content = buildRecipeRequestContent(source());
    expect(content).toBe(
      "Extract the recipe.\n\nSource URL: https://www.tiktok.com/@panaceapalm/video/7641621946563661078\n\n" +
        "=== CAPTION ===\nHigh Protein Sheetpan Chicken Kebabs! 1kg lean ground chicken...\n\n" +
        "=== TRANSCRIPT ===\nGet your onions, bell pepper and garlic",
    );
  });

  it("puts images before the text", () => {
    const content = buildRecipeRequestContent(source({ images: ["AAAA", "BBBB"], sourceUrl: null }));
    expect(Array.isArray(content)).toBe(true);
    const blocks = content as { type: string; source?: { data: string; media_type: string } }[];
    expect(blocks.map((b) => b.type)).toEqual(["image", "image", "text"]);
    expect(blocks[0].source).toMatchObject({ data: "AAAA", media_type: "image/jpeg" });
  });
});

describe("parseRecipe", () => {
  it("uses extraction's sourceName and imageUrl over the model's (regression: TikTok author was dropped)", async () => {
    const recipe = await parseRecipe(source());
    expect(recipe.sourceName).toBe("TikTok — Panacea Palm");
    expect(recipe.imageUrl).toBeNull(); // never the model's guess
  });

  it("falls back to the model's sourceName when extraction has none", async () => {
    const recipe = await parseRecipe(source({ sourceName: null, imageUrl: "https://static01.nyt.com/x.jpg" }));
    expect(recipe.sourceName).toBe("TikTok");
    expect(recipe.imageUrl).toBe("https://static01.nyt.com/x.jpg");
  });

  it("sends one system prompt covering every section kind and the no-recipe rule", async () => {
    await parseRecipe(source());
    const system = state.lastRequest?.system as string;
    for (const label of ["STRUCTURED DATA", "PAGE TEXT", "CAPTION", "TRANSCRIPT", "USER TEXT"]) expect(system).toContain(label);
    expect(system).toContain("do not invent one");
    expect(system).toContain("shoppingName");
  });

  it("throws no_recipe when the model returns no ingredients", async () => {
    state.response = reply(recipeJson({ ingredients: [], instructions: [] }));
    await expect(parseRecipe(source())).rejects.toMatchObject({ reason: "no_recipe" });
    await expect(parseRecipe(source())).rejects.toBeInstanceOf(ImportFailure);
  });

  it("passes the remaining deadline as the request timeout without retries", async () => {
    await parseRecipe(source(), createDeadline(30_000));
    expect(state.lastOptions?.timeout).toBeGreaterThan(25_000);
    expect(state.lastOptions?.timeout).toBeLessThanOrEqual(27_000);
    expect(state.lastOptions?.maxRetries).toBe(0);
    expect(state.lastOptions?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails fast when the deadline is already spent", async () => {
    await expect(parseRecipe(source(), createDeadline(1_000))).rejects.toMatchObject({ reason: "fetch_failed" });
    expect(state.lastRequest).toBeNull();
  });

  it("warns when structured ingredient count and parsed count differ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await parseRecipe(source({ expectedIngredientCount: 3 }));
    expect(warn).toHaveBeenCalledWith("[import] ingredient count mismatch", expect.objectContaining({ structured: 3, parsed: 1 }));
    warn.mockRestore();
  });

  it("surfaces refusals and truncation as errors", async () => {
    state.response = reply({}, "refusal");
    await expect(parseRecipe(source())).rejects.toThrow("declined");
    state.response = reply({}, "max_tokens");
    await expect(parseRecipe(source())).rejects.toThrow("too long");
  });
});

describe("parseRecipeFromUserInput", () => {
  it("sends pasted text as a USER TEXT section", async () => {
    await parseRecipeFromUserInput({ text: "2 eggs, scrambled", images: [], sourceUrl: "https://instagram.com/p/x" });
    const messages = state.lastRequest?.messages as { content: string }[];
    expect(messages[0].content).toContain("=== USER TEXT ===\n2 eggs, scrambled");
    expect(messages[0].content).toContain("Source URL: https://instagram.com/p/x");
  });

  it("sends screenshots alone as image blocks with no empty text section", async () => {
    await parseRecipeFromUserInput({ text: "", images: ["AAAA"], sourceUrl: null });
    const content = (state.lastRequest?.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
    expect(content[1].text).toBe("Extract the recipe.");
  });

  it("sends screenshots and text together", async () => {
    await parseRecipeFromUserInput({ text: "serves 4", images: ["AAAA", "BBBB"], sourceUrl: null });
    const content = (state.lastRequest?.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content.map((b) => b.type)).toEqual(["image", "image", "text"]);
    expect(content[2].text).toContain("=== USER TEXT ===\nserves 4");
  });
});
