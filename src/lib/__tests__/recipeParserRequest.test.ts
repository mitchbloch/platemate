import { beforeEach, describe, expect, it, vi } from "vitest";

// Request-shape tests for the import call: pins the model + effort that
// shipped in the Sonnet 5.5 migration and the response-handling branches.
const state = {
  lastRequest: null as Record<string, unknown> | null,
  response: null as { stop_reason: string; content: { type: string; text?: string }[] } | null,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: Record<string, unknown>) => {
        state.lastRequest = req;
        return state.response;
      },
    };
  },
}));

import { parseRecipeFromText } from "../recipeParser";

const validRecipe = {
  title: "Lemon Chicken Orzo",
  ingredients: [{ name: "chicken thighs", quantity: 1, unit: "lb", preparation: null, category: "meat", raw: "1 lb chicken thighs", shoppingName: "chicken thighs" }],
  instructions: ["Cook it."],
  nutrition: { calories: 500, protein: 40, carbs: 40, fat: 15, saturatedFat: 3, cholesterol: 120, fiber: 3, sodium: 600 },
};

describe("recipe import request", () => {
  beforeEach(() => {
    state.lastRequest = null;
    state.response = { stop_reason: "end_turn", content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(validRecipe) }] };
  });

  it("calls Sonnet 5.5 at low effort with structured output and no thinking override", async () => {
    const recipe = await parseRecipeFromText("lemon chicken orzo: ...");
    expect(recipe.title).toBe("Lemon Chicken Orzo");

    const req = state.lastRequest!;
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.max_tokens).toBe(16000);
    const config = req.output_config as { effort: string; format: { type: string } };
    expect(config.effort).toBe("low");
    expect(config.format.type).toBe("json_schema");
    // `thinking: {type: "disabled"}` 400s on Sonnet 5.5; leave the default (adaptive)
    expect(req).not.toHaveProperty("thinking");
    // No prefill: the request must end on a user turn
    const messages = req.messages as { role: string }[];
    expect(messages.at(-1)?.role).toBe("user");
  });

  it("reads the text block even when thinking blocks come first", async () => {
    state.response = { stop_reason: "end_turn", content: [{ type: "thinking" }, { type: "thinking" }, { type: "text", text: JSON.stringify(validRecipe) }] };
    await expect(parseRecipeFromText("x")).resolves.toMatchObject({ title: "Lemon Chicken Orzo" });
  });

  it("surfaces a refusal", async () => {
    state.response = { stop_reason: "refusal", content: [] };
    await expect(parseRecipeFromText("x")).rejects.toThrow("declined");
  });

  it("surfaces a max_tokens cutoff", async () => {
    state.response = { stop_reason: "max_tokens", content: [{ type: "thinking" }] };
    await expect(parseRecipeFromText("x")).rejects.toThrow("too long");
  });

  it("errors when the response has no text block", async () => {
    state.response = { stop_reason: "end_turn", content: [{ type: "thinking" }] };
    await expect(parseRecipeFromText("x")).rejects.toThrow("Unexpected response format");
  });
});
