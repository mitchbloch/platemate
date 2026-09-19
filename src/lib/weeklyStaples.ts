import { normalizeForMatching } from "./ingredientMerge";
import { toGroceryDisplayCategory } from "./categoryMap";
import { STORE_LABELS } from "./types";
import type { GroceryDisplayCategory, GroceryListItem, PinnedGroceryItem, StoreName } from "./types";

// ── Matching a staple to its copy on a week's list ──

/** The list item a weekly staple materialized as, if any. Fuzzy on name so
 *  "Greek yogurt" still matches "greek yogurt" after an edit or a merge. */
export function findStapleListItem(
  items: GroceryListItem[],
  staple: Pick<PinnedGroceryItem, "name">,
): GroceryListItem | undefined {
  const key = normalizeForMatching(staple.name);
  return items.find((item) => normalizeForMatching(item.name) === key);
}

/** Staples keyed by matching key — built once per render, looked up per row. */
export function indexStaples<T extends Pick<PinnedGroceryItem, "name">>(staples: T[]): Map<string, T> {
  return new Map(staples.map((s) => [normalizeForMatching(s.name), s]));
}

/** The staple a list row was materialized from, if any. */
export function stapleForItem<T>(index: Map<string, T>, item: Pick<GroceryListItem, "name">): T | undefined {
  return index.get(normalizeForMatching(item.name));
}

// ── Validating a staple edit ──

export interface PinnedItemUpdates {
  name?: string;
  category?: GroceryDisplayCategory;
  store?: StoreName;
  quantity?: number | null;
  unit?: string | null;
}

export type PinnedItemValidation =
  | { ok: true; updates: PinnedItemUpdates }
  | { ok: false; error: string };

export function validatePinnedItemUpdate(body: unknown): PinnedItemValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;
  const updates: PinnedItemUpdates = {};

  if ("name" in b) {
    if (typeof b.name !== "string" || !b.name.trim()) return { ok: false, error: "Name is required" };
    updates.name = b.name.trim();
  }
  if ("category" in b) {
    const canonical = typeof b.category === "string" ? toGroceryDisplayCategory(b.category) : null;
    if (!canonical) return { ok: false, error: "Invalid category" };
    updates.category = canonical;
  }
  if ("store" in b) {
    if (typeof b.store !== "string" || !(b.store in STORE_LABELS)) return { ok: false, error: "Invalid store" };
    updates.store = b.store as StoreName;
  }
  if ("quantity" in b) {
    if (b.quantity !== null && (typeof b.quantity !== "number" || !Number.isFinite(b.quantity) || b.quantity < 0)) {
      return { ok: false, error: "Quantity must be a non-negative number" };
    }
    updates.quantity = b.quantity as number | null;
  }
  if ("unit" in b) {
    if (b.unit !== null && typeof b.unit !== "string") return { ok: false, error: "Unit must be text" };
    updates.unit = typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : null;
  }

  if (Object.keys(updates).length === 0) return { ok: false, error: "Nothing to update" };
  return { ok: true, updates };
}
