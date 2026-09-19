import { describe, expect, it } from "vitest";
import { canonicalDisplayCategory, findStapleListItem, isStapleItem, stapleKeySet, validatePinnedItemUpdate } from "../weeklyStaples";
import type { GroceryListItem } from "../types";

function item(name: string, over: Partial<GroceryListItem> = {}): GroceryListItem {
  return {
    id: name, householdId: "h", groceryListId: "l", name, quantity: null, unit: null,
    category: "produce", store: "trader-joes", checked: false, dismissed: false,
    recipeIds: [], isManual: true, sortOrder: 0, ...over,
  };
}

describe("findStapleListItem", () => {
  it("matches the staple's copy on the list regardless of case and qualifiers", () => {
    const items = [item("Bananas"), item("Greek yogurt")];
    expect(findStapleListItem(items, { name: "greek yogurt" })?.id).toBe("Greek yogurt");
    expect(findStapleListItem(items, { name: "Organic Bananas" })?.id).toBe("Bananas");
    expect(findStapleListItem(items, { name: "milk" })).toBeUndefined();
  });

  it("tags list rows that correspond to a staple", () => {
    const keys = stapleKeySet([{ name: "Yogurt" }]);
    expect(isStapleItem(item("yogurt"), keys)).toBe(true);
    expect(isStapleItem(item("Milk"), keys)).toBe(false);
  });
});

describe("validatePinnedItemUpdate", () => {
  it("normalizes category casing to the canonical display key", () => {
    expect(canonicalDisplayCategory("dairy")).toBe("Dairy");
    expect(canonicalDisplayCategory("PRODUCE")).toBe("Produce");
    expect(canonicalDisplayCategory("meat")).toBeNull();
    expect(validatePinnedItemUpdate({ category: "dairy" })).toEqual({ ok: true, updates: { category: "Dairy" } });
  });

  it("accepts a full edit and trims text", () => {
    expect(validatePinnedItemUpdate({ name: " Yogurt ", category: "Dairy", store: "target", quantity: 2, unit: " tubs " })).toEqual({
      ok: true,
      updates: { name: "Yogurt", category: "Dairy", store: "target", quantity: 2, unit: "tubs" },
    });
  });

  it("rejects bad values instead of coercing", () => {
    expect(validatePinnedItemUpdate({ name: "  " }).ok).toBe(false);
    expect(validatePinnedItemUpdate({ store: "amazon" }).ok).toBe(false);
    expect(validatePinnedItemUpdate({ quantity: -1 }).ok).toBe(false);
    expect(validatePinnedItemUpdate({ quantity: "2" }).ok).toBe(false);
    expect(validatePinnedItemUpdate({}).ok).toBe(false);
    expect(validatePinnedItemUpdate(null).ok).toBe(false);
  });

  it("allows clearing quantity and unit", () => {
    expect(validatePinnedItemUpdate({ quantity: null, unit: "" })).toEqual({ ok: true, updates: { quantity: null, unit: null } });
  });
});
