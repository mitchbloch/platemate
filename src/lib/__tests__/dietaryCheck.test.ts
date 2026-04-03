import { describe, it, expect } from "vitest";
import { checkDietaryConflicts } from "../dietaryCheck";
import type { DietaryFlag } from "../types";

describe("checkDietaryConflicts", () => {
  it("returns no warnings when no household preferences", () => {
    const warnings = checkDietaryConflicts(["vegetarian", "gluten-free"], []);
    expect(warnings).toEqual([]);
  });

  it("returns no warnings when recipe satisfies all preferences", () => {
    const flags: DietaryFlag[] = ["vegetarian", "dairy-free", "gluten-free"];
    const warnings = checkDietaryConflicts(flags, ["vegetarian", "dairy-free"]);
    expect(warnings).toEqual([]);
  });

  it("returns warning when recipe missing a preference", () => {
    const flags: DietaryFlag[] = ["vegetarian", "gluten-free"];
    const warnings = checkDietaryConflicts(flags, ["dairy-free"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].preference).toBe("dairy-free");
    expect(warnings[0].message).toContain("dairy-free");
  });

  it("returns multiple warnings for multiple unmet preferences", () => {
    const flags: DietaryFlag[] = ["vegetarian"];
    const warnings = checkDietaryConflicts(flags, ["dairy-free", "gluten-free", "low-sodium"]);
    expect(warnings).toHaveLength(3);
    expect(warnings.map((w) => w.preference)).toEqual(["dairy-free", "gluten-free", "low-sodium"]);
  });

  it("returns no warnings when recipe has no flags but no preferences either", () => {
    const warnings = checkDietaryConflicts([], []);
    expect(warnings).toEqual([]);
  });

  it("warns for all preferences when recipe has empty flags", () => {
    const warnings = checkDietaryConflicts([], ["vegetarian", "nut-free"]);
    expect(warnings).toHaveLength(2);
  });
});
