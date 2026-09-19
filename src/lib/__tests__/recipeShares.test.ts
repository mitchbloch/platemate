import { describe, expect, it } from "vitest";
import { newShareToken, rowToRecipeShare, sharePath } from "../recipeShares";

describe("share tokens", () => {
  it("are URL-safe, 128-bit, and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newShareToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });

  it("build the public path", () => {
    expect(sharePath("abc_DEF-123")).toBe("/r/abc_DEF-123");
  });
});

describe("rowToRecipeShare", () => {
  it("converts a row and defaults the counters", () => {
    expect(rowToRecipeShare({ id: "s1", recipe_id: "r1", token: "t", view_count: null, save_count: 2, revoked_at: null, created_at: "2026-01-01" })).toEqual({
      id: "s1", recipeId: "r1", token: "t", viewCount: 0, saveCount: 2, revokedAt: null, createdAt: "2026-01-01",
    });
  });
});
