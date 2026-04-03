import type { GroceryListItem, StoreName, IngredientCategory } from "./types";
import {
  INGREDIENT_TO_GROCERY_CATEGORY,
  GROCERY_CATEGORY_LABELS,
  GROCERY_CATEGORY_ORDER,
} from "./categoryMap";
import { STORE_LABELS } from "./types";

/** Format quantity for clipboard display */
function formatQty(quantity: number | null, unit: string | null): string {
  if (quantity === null && unit === null) return "";
  if (quantity === null) return unit ? ` (${unit})` : "";
  if (unit === null) return quantity === 1 ? "" : ` x${quantity}`;
  return ` ${quantity} ${unit}`;
}

/**
 * Format grocery list items for clipboard copy, matching the user's
 * Apple Notes format with checkbox items grouped by category then store.
 *
 * Output:
 *   Protein
 *   - [ ] Ground turkey
 *   - [ ] Chicken breast x2
 *
 *   Produce
 *   - [ ] Bell peppers x2
 *   ...
 *
 *   Target
 *   - [ ] Rice cakes
 */
export function formatForClipboard(items: GroceryListItem[]): string {
  // Only include unchecked items
  const unchecked = items.filter((i) => !i.checked && !i.dismissed);
  if (unchecked.length === 0) return "All items checked off!";

  const tjItems = unchecked.filter((i) => i.store === "trader-joes");
  const nonTjItems = unchecked.filter((i) => i.store !== "trader-joes");

  const sections: string[] = [];

  // TJ's items grouped by display category
  for (const cat of GROCERY_CATEGORY_ORDER) {
    const catItems = tjItems.filter(
      (i) =>
        INGREDIENT_TO_GROCERY_CATEGORY[i.category as IngredientCategory] === cat,
    );
    if (catItems.length === 0) continue;

    const label = GROCERY_CATEGORY_LABELS[cat];
    const lines = catItems.map((i) => `- [ ] ${i.name}${formatQty(i.quantity, i.unit)}`);
    sections.push(`${label}\n${lines.join("\n")}`);
  }

  // Non-TJ's items grouped by store
  const NON_TJ_STORES: StoreName[] = ["target", "whole-foods", "hmart", "other"];
  for (const store of NON_TJ_STORES) {
    const storeItems = nonTjItems.filter((i) => i.store === store);
    if (storeItems.length === 0) continue;

    const label = STORE_LABELS[store];
    const lines = storeItems.map((i) => `- [ ] ${i.name}${formatQty(i.quantity, i.unit)}`);
    sections.push(`${label}\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}
