import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  parse: null as null | ((text: string, sourceUrl?: string) => Promise<unknown>),
  calls: [] as { text: string; sourceUrl?: string }[],
}));

vi.mock("@/lib/recipeParser", () => ({
  parseRecipeFromText: (text: string, sourceUrl?: string) => {
    state.calls.push({ text, sourceUrl });
    return state.parse!(text, sourceUrl);
  },
}));

import { POST } from "../route";
import { ImportFailure } from "@/lib/import/fetchPage";

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/recipes/parse-text", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
}

beforeEach(() => {
  state.calls = [];
  state.parse = async () => ({ title: "Chili" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/recipes/parse-text", () => {
  it("parses trimmed text with a cleaned source URL", async () => {
    const res = await post({ text: "  1 lb turkey  ", sourceUrl: "https://www.instagram.com/reel/x/?igsh=abc" });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual([{ text: "1 lb turkey", sourceUrl: "https://www.instagram.com/reel/x/" }]);
  });

  it("maps no_recipe to a 422 that keeps the user in Paste Text", async () => {
    state.parse = async () => {
      throw new ImportFailure("no_recipe");
    };
    const res = await post({ text: "recipe in bio!", sourceUrl: "https://www.tiktok.com/@u/video/1" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Couldn't find a full recipe there (it may be behind a paywall).",
      reason: "no_recipe",
      canPaste: true,
      sourceUrl: "https://www.tiktok.com/@u/video/1",
    });
  });

  it.each([
    ["not json", "Invalid JSON body"],
    [{}, "Missing required field: text"],
    [{ text: "   " }, "Missing required field: text"],
    [{ text: "x".repeat(50_001) }, "Recipe text is too long (max 50,000 characters)"],
  ])("rejects bad input with 400", async (body, error) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});
