import { describe, it, expect } from "vitest";
import { isVideoUrl } from "../recipeParser";

describe("isVideoUrl", () => {
  it("detects video platforms", () => {
    expect(isVideoUrl("https://www.tiktok.com/@user/video/123")).toBe(true);
    expect(isVideoUrl("https://youtu.be/abc123")).toBe(true);
    expect(isVideoUrl("https://www.instagram.com/reel/xyz/")).toBe(true);
  });

  it("does not flag lookalike domains", () => {
    expect(isVideoUrl("https://nottiktok.com/video")).toBe(false);
    expect(isVideoUrl("https://www.budgetbytes.com/recipe")).toBe(false);
  });
});
