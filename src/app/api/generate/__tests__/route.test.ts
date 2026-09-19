import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RecipeGeneration } from "@/lib/types";

const state = {
  generation: null as RecipeGeneration | null,
  claude: { stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] } as { stop_reason: string; content: { type: string; text: string }[] },
  created: [] as string[],
  appended: [] as unknown[],
  lastRequest: null as Record<string, unknown> | null,
  turnsToday: 0,
  appendThrows: null as Error | null,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: async (req: Record<string, unknown>) => { state.lastRequest = req; return state.claude; } };
  },
}));
vi.mock("@/lib/recipes", () => ({ listRecipes: async () => [{ id: "a", title: "Chicken Tacos", mealType: "dinner", ingredients: [] }] }));
vi.mock("@/lib/household", () => ({ getHousehold: async () => ({ defaultServings: 2, dietaryPreferences: [], nutritionPriorities: [] }) }));
vi.mock("@/lib/supabase/auth", () => ({ getActiveHouseholdId: async () => "h1" }));
vi.mock("@/lib/recipeGenerations", () => ({
  GenerationConflictError: class extends Error { constructor() { super("Someone else just added to this chat — reload to see it"); } },
  listActiveGenerations: async () => [],
  getGeneration: async () => state.generation,
  countHouseholdTurnsSince: async () => state.turnsToday,
  createGeneration: async (msg: string) => { state.created.push(msg); return { ...base(), id: "g-new" }; },
  appendTurn: async (gen: { id: string }, turn: unknown, draft: unknown) => {
    if (state.appendThrows) throw state.appendThrows;
    state.appended.push({ id: gen.id, turn, draft });
    return { ...base(), id: gen.id };
  },
}));

import { POST } from "../route";

function base(): RecipeGeneration {
  return { id: "g1", householdId: "h1", createdBy: "u1", title: "t", messages: [], draft: null, status: "active", savedRecipeId: null, createdAt: "", updatedAt: "" };
}
function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/generate", () => {
  beforeEach(() => {
    state.generation = null;
    state.created = [];
    state.appended = [];
    state.lastRequest = null;
    state.turnsToday = 0;
    state.appendThrows = null;
    state.claude = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ reply: "Sure", options: [{ title: "A", summary: "a" }], recipe: null, libraryMatches: [{ recipeId: "a", reason: "fits" }], seenIngredients: [] }) }] };
  });

  it("400s on an empty request", async () => {
    expect((await post({ message: "" })).status).toBe(400);
  });

  it("starts a new chat, calls Claude with the cached library digest, and persists both turns", async () => {
    const res = await post({ message: "Something with chicken" });
    expect(res.status).toBe(200);
    expect(state.created).toEqual(["Something with chicken"]);
    const req = state.lastRequest!;
    expect(req.model).toBe("claude-sonnet-5");
    expect((req.system as { cache_control?: unknown }[]).at(-1)?.cache_control).toEqual({ type: "ephemeral" });
    expect((req.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const { turn, draft } = state.appended[0] as { turn: { user: { content: string }; assistant: { options: unknown[]; libraryMatches: { title: string }[] } }; draft: unknown };
    expect(turn.user.content).toBe("Something with chicken");
    expect(turn.assistant.options).toHaveLength(1);
    expect(turn.assistant.libraryMatches[0].title).toBe("Chicken Tacos");
    expect(draft).toBeNull();
  });

  it("replays history and appends to an existing chat", async () => {
    state.generation = { ...base(), messages: [
      { role: "user", content: "hi", photoCount: 0, seenIngredients: [], at: "" },
      { role: "assistant", reply: "hey", options: null, recipe: null, libraryMatches: [], at: "" },
    ] };
    const res = await post({ generationId: "g1", message: "Make option A" });
    expect(res.status).toBe(200);
    expect(state.created).toEqual([]);
    expect((state.lastRequest!.messages as unknown[]).length).toBe(3);
  });

  it("refuses after the turn cap", async () => {
    state.generation = { ...base(), messages: Array.from({ length: 20 }, () => ({ role: "user" as const, content: "x", photoCount: 0, seenIngredients: [], at: "" })) };
    expect((await post({ generationId: "g1", message: "more" })).status).toBe(409);
    expect(state.lastRequest).toBeNull();
  });

  it("404s for an unknown chat and 409s for a saved one", async () => {
    expect((await post({ generationId: "missing", message: "x" })).status).toBe(404);
    state.generation = { ...base(), status: "saved", savedRecipeId: "r1" };
    expect((await post({ generationId: "g1", message: "x" })).status).toBe(409);
  });

  it("429s once the household has used its daily budget, before calling Claude", async () => {
    state.turnsToday = 100;
    expect((await post({ message: "x" })).status).toBe(429);
    expect(state.lastRequest).toBeNull();
  });

  it("409s (not 500) when a partner appended to the same chat first", async () => {
    const { GenerationConflictError } = await import("@/lib/recipeGenerations");
    state.appendThrows = new GenerationConflictError();
    const res = await post({ message: "x" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/reload/);
  });

  it("hides internal error detail behind a generic 500", async () => {
    state.appendThrows = new Error('duplicate key value violates unique constraint "recipe_generations_pkey"');
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ message: "x" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/constraint/);
    spy.mockRestore();
  });

  it("surfaces a refusal without persisting anything", async () => {
    state.claude = { stop_reason: "refusal", content: [] };
    expect((await post({ message: "x" })).status).toBe(422);
    expect(state.appended).toEqual([]);
  });
});
