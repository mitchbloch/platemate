import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Input = { text: string; images: string[]; sourceUrl: string | null };
const state = vi.hoisted(() => ({
  parse: null as null | ((input: Input) => Promise<unknown>),
  calls: [] as Input[],
}));

vi.mock("@/lib/recipeParser", () => ({
  parseRecipeFromUserInput: (input: Input) => {
    state.calls.push(input);
    return state.parse!(input);
  },
}));

import { POST } from "../route";
import { ImportFailure } from "@/lib/import/failure";
import { MAX_IMAGE_BASE64_CHARS } from "@/lib/imageInput";

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/recipes/parse-text", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
}

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.calls = [];
  state.parse = async () => ({ title: "Chili" });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/recipes/parse-text", () => {
  it("parses trimmed text with a cleaned source URL", async () => {
    const res = await post({ text: "  1 lb turkey  ", sourceUrl: "https://www.instagram.com/reel/x/?igsh=abc" });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual([{ text: "1 lb turkey", images: [], sourceUrl: "https://www.instagram.com/reel/x/" }]);
  });

  it("parses screenshots with no text", async () => {
    const res = await post({ images: ["/9j/AAAA", "/9j/BBBB"] });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual([{ text: "", images: ["/9j/AAAA", "/9j/BBBB"], sourceUrl: null }]);
    expect(JSON.parse(info.mock.calls[0][1] as string)).toMatchObject({ source: "screenshots", outcome: "ok" });
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
    [{}, "Paste the recipe text or add a screenshot"],
    [{ text: "   ", images: [] }, "Paste the recipe text or add a screenshot"],
    [{ text: "x".repeat(50_001) }, "Recipe text is too long (max 50,000 characters)"],
    [{ images: ["a", "b", "c", "d", "e", "f"] }, "Up to 5 screenshots"],
    [{ images: ["A".repeat(MAX_IMAGE_BASE64_CHARS + 1)] }, "A screenshot is too large — try a smaller one"],
    [{ images: ["data:image/png;base64,AAAA"] }, "Screenshots must be base64 JPEG"],
    [{ images: "AAAA" }, "Screenshots must be a list"],
  ])("rejects bad input with 400 (%#)", async (body, error) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(state.calls).toEqual([]);
  });
});
