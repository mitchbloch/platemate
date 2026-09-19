import { describe, expect, it } from "vitest";
import { rowToPinnedItem } from "../pinnedItems";

describe("rowToPinnedItem", () => {
  it("converts a row and canonicalizes the section casing older rows were saved with", () => {
    const base = { id: "p1", household_id: "h1", name: "Yogurt", store: "target", quantity: 2, unit: "tubs", created_at: "2026-01-01" };
    expect(rowToPinnedItem({ ...base, category: "produce" })).toEqual({
      id: "p1", householdId: "h1", name: "Yogurt", category: "Produce", store: "target", quantity: 2, unit: "tubs", createdAt: "2026-01-01",
    });
    expect(rowToPinnedItem({ ...base, category: "Dairy" }).category).toBe("Dairy");
    expect(rowToPinnedItem({ ...base, category: "PANTRY" }).category).toBe("Pantry");
  });

  it("falls back to Other for unknown or missing sections", () => {
    const base = { id: "p1", household_id: "h1", name: "x", store: "trader-joes", quantity: null, unit: null, created_at: "" };
    expect(rowToPinnedItem({ ...base, category: "snacks" }).category).toBe("Other");
    expect(rowToPinnedItem({ ...base, category: null }).category).toBe("Other");
  });
});
