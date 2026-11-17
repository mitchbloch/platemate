import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportFailure, importErrorResult } from "../failure";

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("importErrorResult", () => {
  const ctx = { source: "web", stage: "extract" as const, started: Date.now() - 1_200, sourceUrl: "https://site.com/r" };

  it("turns an ImportFailure into a 422 the form can act on, logged with its reason", () => {
    const result = importErrorResult(new ImportFailure("blocked", "HTTP 403"), ctx);
    expect(result).toEqual({
      status: 422,
      body: { error: "This site doesn't allow automatic import.", reason: "blocked", canPaste: true, sourceUrl: "https://site.com/r" },
    });
    const logged = JSON.parse(info.mock.calls[0][1] as string);
    expect(logged).toMatchObject({ source: "web", outcome: "failed", stage: "extract", reason: "blocked", detail: "HTTP 403" });
    expect(logged.ms).toBeGreaterThanOrEqual(1_200);
    expect(error).not.toHaveBeenCalled();
  });

  it("turns anything else into a 500 with its message, logged as an error", () => {
    expect(importErrorResult(new Error("Importing took too long — try again"), ctx)).toEqual({
      status: 500,
      body: { error: "Importing took too long — try again" },
    });
    expect(JSON.parse(info.mock.calls[0][1] as string)).toMatchObject({ outcome: "error" });
    expect(error).toHaveBeenCalled();
    expect(importErrorResult("weird", ctx).body).toEqual({ error: "Failed to import recipe" });
  });
});

describe("client-bundle safety (regression: d282e36)", () => {
  // RecipeGenerator (client) → recipeGeneration → recipeParser → … . A value
  // import of a Node module anywhere on that chain breaks `next build`.
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  const valueImports = (src: string) =>
    [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);

  it("failure.ts has no imports at all", () => {
    expect(valueImports(read("failure.ts"))).toEqual([]);
  });

  it("recipeParser.ts imports nothing Node-only (fetchPage only as a type)", () => {
    const imports = valueImports(read("../recipeParser.ts"));
    expect(imports.filter((i) => i.startsWith("node:"))).toEqual([]);
    expect(imports).not.toContain("./import/fetchPage");
    expect(imports).not.toContain("./import");
  });
});
