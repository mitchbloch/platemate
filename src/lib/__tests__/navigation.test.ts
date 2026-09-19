import { describe, expect, it } from "vitest";
import { backLinkFor, safeInternalPath } from "../navigation";

describe("safeInternalPath", () => {
  it("accepts same-origin paths with query strings", () => {
    expect(safeInternalPath("/plan?add=1&q=chicken")).toBe("/plan?add=1&q=chicken");
  });
  it("rejects anything that could leave the origin", () => {
    expect(safeInternalPath("//evil.com/x")).toBeNull();
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath("/\\evil.com")).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath(["/plan"])).toBeNull();
  });
});

describe("backLinkFor", () => {
  it("returns to the plan page with its picker state when that is where you came from", () => {
    expect(backLinkFor("/plan?add=1&q=tofu")).toEqual({ href: "/plan?add=1&q=tofu", label: "Back to plan" });
  });
  it("defaults to the recipe library", () => {
    expect(backLinkFor(undefined)).toEqual({ href: "/recipes", label: "Back to recipes" });
    expect(backLinkFor("https://evil.com")).toEqual({ href: "/recipes", label: "Back to recipes" });
  });
});
