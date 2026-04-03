import { createClient } from "./supabase/server";
import { getActiveHouseholdId } from "./supabase/auth";
import type {
  GroceryDisplayCategory,
  IngredientCategory,
  PinnedGroceryItem,
  StoreName,
} from "./types";

// ── Row Converters ──

function rowToPinnedItem(row: Record<string, unknown>): PinnedGroceryItem {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    name: row.name as string,
    category: row.category as GroceryDisplayCategory,
    store: row.store as StoreName,
    quantity: row.quantity as number | null,
    unit: row.unit as string | null,
    createdAt: row.created_at as string,
  };
}

// ── CRUD ──

export async function getPinnedItems(): Promise<PinnedGroceryItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pinned_grocery_items")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data ?? []).map(rowToPinnedItem);
}

export async function addPinnedItem(item: {
  name: string;
  category: GroceryDisplayCategory;
  store: StoreName;
  quantity: number | null;
  unit: string | null;
}): Promise<PinnedGroceryItem> {
  const supabase = await createClient();

  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from("pinned_grocery_items")
    .insert({
      household_id: householdId,
      name: item.name,
      category: item.category,
      store: item.store,
      quantity: item.quantity,
      unit: item.unit,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToPinnedItem(data);
}

export async function removePinnedItem(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("pinned_grocery_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ── Frequent Items ──

/**
 * Find items that appear in grocery lists across multiple weeks.
 * Items appearing 3+ times that are not already pinned get suggested.
 */
export async function getFrequentItems(
  weekCount: number = 8,
): Promise<{ name: string; count: number; category: IngredientCategory; store: StoreName }[]> {
  const supabase = await createClient();

  // Get recent grocery lists
  const { data: lists, error: listsError } = await supabase
    .from("grocery_lists")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(weekCount);

  if (listsError) throw listsError;
  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);

  // Get all items from those lists
  const { data: items, error: itemsError } = await supabase
    .from("grocery_list_items")
    .select("name, category, store")
    .in("grocery_list_id", listIds);

  if (itemsError) throw itemsError;
  if (!items) return [];

  // Count occurrences by normalized name
  const counts = new Map<string, { name: string; count: number; category: IngredientCategory; store: StoreName }>();
  for (const item of items) {
    const key = (item.name as string).toLowerCase().trim();
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        name: item.name as string,
        count: 1,
        category: item.category as IngredientCategory,
        store: item.store as StoreName,
      });
    }
  }

  // Get pinned items to exclude
  const pinned = await getPinnedItems();
  const pinnedNames = new Set(pinned.map((p) => p.name.toLowerCase().trim()));

  // Filter to 3+ occurrences, not already pinned
  return Array.from(counts.values())
    .filter((item) => item.count >= 3 && !pinnedNames.has(item.name.toLowerCase().trim()))
    .sort((a, b) => b.count - a.count);
}
