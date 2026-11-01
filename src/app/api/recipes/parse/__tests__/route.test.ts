import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ImportSource } from "@/lib/import";

const state = vi.hoisted(() => ({
  extract: null as null | ((url: string) => Promise<unknown>),
  parse: null as null | ((source: unknown) => Promise<unknown>),
}));

vi.mock("@/lib/import", () => ({ IMPORT_BUDGET_MS: 57_000, EXTRACT_BUDGET_MS: 15_000, extractImportSource: (url: string) => state.extract!(url) }));
vi.mock("@/lib/recipeParser", () => ({ parseRecipe: (source: unknown) => state.parse!(source) }));

import { POST } from "../route";
import { ImportFailure } from "@/lib/import/failure";

const extracted: ImportSource = {
  sections: [{ label: "CAPTION", text: "1kg chicken" }],
  images: [],
  sourceName: "TikTok — Panacea Palm",
  imageUrl: null,
  sourceUrl: "https://www.tiktok.com/@panaceapalm/video/1",
};

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/recipes/parse", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
}

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.extract = async () => extracted;
  state.parse = async () => ({ title: "Kebabs" });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/recipes/parse", () => {
  it("extracts, parses and returns the recipe", async () => {
    let parsedSource: unknown;
    state.parse = async (source) => {
      parsedSource = source;
      return { title: "Kebabs" };
    };
    const res = await post({ url: "https://www.tiktok.com/t/ZPLPoL8uG/" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "Kebabs" });
    expect(parsedSource).toBe(extracted);
    expect(info).toHaveBeenCalledWith("[import]", expect.stringContaining('"outcome":"ok"'));
  });

  it.each([
    ["blocked", "This site doesn't allow automatic import."],
    ["login_required", "This post is private or needs a login."],
    ["not_found", "Couldn't open that page — the link may be broken, or the site may not allow automatic import."],
    ["unsupported", "That link isn't a page we can read."],
    ["fetch_failed", "Couldn't reach that page."],
  ] as const)("maps an extraction failure (%s) to a 422 the form can act on", async (reason, message) => {
    state.extract = async () => {
      throw new ImportFailure(reason, "detail for logs");
    };
    const res = await post({ url: "https://www.budgetbytes.com/x/?utm_source=pinterest" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: message, reason, canPaste: true, sourceUrl: "https://www.budgetbytes.com/x/" });
    const logged = JSON.parse(info.mock.calls[0][1] as string);
    expect(logged).toMatchObject({ source: "web", outcome: "failed", stage: "extract", reason, detail: "detail for logs" });
  });

  it("maps a no-recipe parse to a 422 at the parse stage", async () => {
    state.parse = async () => {
      throw new ImportFailure("no_recipe");
    };
    const res = await post({ url: "https://www.tiktok.com/@u/video/1" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: "no_recipe", canPaste: true });
    expect(JSON.parse(info.mock.calls[0][1] as string)).toMatchObject({ source: "tiktok", stage: "parse" });
  });

  it("returns 500 for unexpected errors", async () => {
    state.parse = async () => {
      throw new Error("Claude declined to process this content");
    };
    const res = await post({ url: "https://example.com/r" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Claude declined to process this content" });
  });

  it.each([
    ["not json", "Invalid JSON body"],
    [{}, "Missing required field: url"],
    [{ url: 42 }, "Missing required field: url"],
    [{ url: "not a url" }, "Invalid URL format"],
  ])("rejects bad input %j with 400", async (body, error) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});
