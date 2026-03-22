import { describe, it, expect } from "vitest";
import { formatForClipboard } from "../groceryExport";
import type { GroceryListItem } from "../types";

function makeItem(
  overrides: Partial<GroceryListItem> & { name: string },
): GroceryListItem {
  return {
    id: Math.random().toString(),
    groceryListId: "list-1",
    quantity: null,
    unit: null,
    category: "other",
    store: "trader-joes",
    checked: false,
    recipeIds: [],
    ...overrides,
  };
}

describe("formatForClipboard", () => {
  it("groups TJ's items by display category in order", () => {
    const items = [
      makeItem({ name: "Rice", category: "grain" }),
      makeItem({ name: "Chicken breast", category: "meat", quantity: 2, unit: null }),
      makeItem({ name: "Bell peppers", category: "produce", quantity: 2, unit: null }),
      makeItem({ name: "Garlic", category: "produce" }),
      makeItem({ name: "Almond milk", category: "dairy" }),
    ];

    const result = formatForClipboard(items);

    expect(result).toBe(
      `Protein\n- [ ] Chicken breast x2\n\nProduce\n- [ ] Bell peppers x2\n- [ ] Garlic\n\nDairy\n- [ ] Almond milk\n\nOther\n- [ ] Rice`,
    );
  });

  it("puts non-TJ's items in separate store sections at the bottom", () => {
    const items = [
      makeItem({ name: "Chicken", category: "meat" }),
      makeItem({ name: "Rice cakes", category: "other", store: "target" }),
      makeItem({ name: "Gochujang", category: "condiment", store: "hmart" }),
    ];

    const result = formatForClipboard(items);

    expect(result).toContain("Protein\n- [ ] Chicken");
    expect(result).toContain("Target\n- [ ] Rice cakes");
    expect(result).toContain("H Mart\n- [ ] Gochujang");

    // Verify order: TJ's categories first, then Target, then H Mart
    const proteinIdx = result.indexOf("Protein");
    const targetIdx = result.indexOf("Target");
    const hmartIdx = result.indexOf("H Mart");
    expect(proteinIdx).toBeLessThan(targetIdx);
    expect(targetIdx).toBeLessThan(hmartIdx);
  });

  it("excludes checked items", () => {
    const items = [
      makeItem({ name: "Chicken", category: "meat", checked: false }),
      makeItem({ name: "Rice", category: "grain", checked: true }),
    ];

    const result = formatForClipboard(items);

    expect(result).toContain("Chicken");
    expect(result).not.toContain("Rice");
  });

  it("returns message when all items checked", () => {
    const items = [
      makeItem({ name: "Chicken", category: "meat", checked: true }),
    ];

    expect(formatForClipboard(items)).toBe("All items checked off!");
  });

  it("formats quantities correctly", () => {
    const items = [
      makeItem({ name: "Butter", category: "dairy", quantity: 1, unit: "tbsp" }),
      makeItem({ name: "Milk", category: "dairy", quantity: 2, unit: "cup" }),
      makeItem({ name: "Eggs", category: "dairy", quantity: 12, unit: null }),
      makeItem({ name: "Salt", category: "spice", quantity: null, unit: null }),
      makeItem({ name: "Yogurt", category: "dairy", quantity: 1, unit: null }),
    ];

    const result = formatForClipboard(items);

    expect(result).toContain("- [ ] Butter 1 tbsp");
    expect(result).toContain("- [ ] Milk 2 cup");
    expect(result).toContain("- [ ] Eggs x12");
    expect(result).toContain("- [ ] Salt");
    expect(result).toContain("- [ ] Yogurt"); // quantity 1, no unit = no suffix
  });

  it("handles empty list", () => {
    expect(formatForClipboard([])).toBe("All items checked off!");
  });
});
