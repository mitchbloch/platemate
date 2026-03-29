import { createClient } from "./supabase/server";
import {
  deduplicateIngredients,
  normalizeIngredientName,
  normalizeUnit,
} from "./ingredientMerge";
import { getPinnedItems } from "./pinnedItems";
import { getPantryItems } from "./pantryItems";
import type {
  GroceryList,
  GroceryListItem,
  GroceryListStatus,
  GroceryListWithItems,
  IngredientCategory,
  MealPlanRecipe,
  MergedIngredient,
  Recipe,
  StoreName,
} from "./types";

// ── Row Converters ──

function rowToGroceryList(row: Record<string, unknown>): GroceryList {
  return {
    id: row.id as string,
    weekStart: row.week_start as string,
    mealPlanId: (row.meal_plan_id as string) ?? null,
    status: (row.status as GroceryListStatus) ?? "edit",
    completedAt: (row.completed_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToGroceryListItem(row: Record<string, unknown>): GroceryListItem {
  return {
    id: row.id as string,
    groceryListId: row.grocery_list_id as string,
    name: row.name as string,
    quantity: row.quantity as number | null,
    unit: row.unit as string | null,
    category: row.category as IngredientCategory,
    store: row.store as StoreName,
    checked: row.checked as boolean,
    dismissed: row.dismissed as boolean,
    recipeIds: row.recipe_ids as string[],
    isManual: row.is_manual as boolean,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

// ── Read Operations ──

async function fetchListItems(
  listId: string,
): Promise<GroceryListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grocery_list_items")
    .select("*")
    .eq("grocery_list_id", listId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(rowToGroceryListItem);
}

/**
 * Get or lazily create a grocery list for the given week.
 * On creation, pre-populates with pinned items (auto-dismissing pantry matches).
 */
export async function getOrCreateGroceryListByWeek(
  weekStart: string,
): Promise<GroceryListWithItems> {
  const supabase = await createClient();

  // Try to find existing list
  const { data: existing, error: findError } = await supabase
    .from("grocery_lists")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const list = rowToGroceryList(existing);
    const items = await fetchListItems(list.id);
    return { list, items };
  }

  // Create new list (no meal_plan_id yet)
  const { data: newList, error: createError } = await supabase
    .from("grocery_lists")
    .insert({ week_start: weekStart })
    .select()
    .single();

  if (createError) throw createError;
  const list = rowToGroceryList(newList);

  // Pre-populate with pinned items
  const [pinnedItems, pantryItems] = await Promise.all([
    getPinnedItems(),
    getPantryItems(),
  ]);
  const pantryNames = new Set(
    pantryItems.map((p) => p.name.toLowerCase().trim()),
  );

  if (pinnedItems.length > 0) {
    // Assign sort_order per group for seeded items
    const groupCounters = new Map<string, number>();
    const rows = pinnedItems.map((pinned) => {
      const key = `${pinned.store}|${categoryToDb(pinned.category)}`;
      const count = (groupCounters.get(key) ?? 0) + 1;
      groupCounters.set(key, count);
      return {
        grocery_list_id: list.id,
        name: pinned.name,
        quantity: pinned.quantity,
        unit: pinned.unit,
        category: categoryToDb(pinned.category),
        store: pinned.store,
        checked: false,
        dismissed: pantryNames.has(pinned.name.toLowerCase().trim()),
        recipe_ids: [],
        is_manual: true,
        sort_order: count * 1000,
      };
    });
    const { error: insertError } = await supabase
      .from("grocery_list_items")
      .insert(rows);
    if (insertError) throw insertError;
  }

  const items = await fetchListItems(list.id);
  return { list, items };
}

// ── Generate ──

export function generateGroceryItems(
  meals: Array<MealPlanRecipe & { recipe: Recipe }>,
): MergedIngredient[] {
  const mealInputs = meals.map((m) => ({
    meal: {
      id: m.id,
      mealPlanId: m.mealPlanId,
      recipeId: m.recipeId,
      dayOfWeek: m.dayOfWeek,
      mealType: m.mealType,
      servingsOverride: m.servingsOverride,
    },
    recipe: m.recipe,
  }));
  return deduplicateIngredients(mealInputs);
}

// ── Write Operations ──

/**
 * Merge recipe-derived items into an existing grocery list, preserving manual items.
 *
 * 1. Delete items where is_manual = false (previous recipe-derived items)
 * 2. Clear recipe_ids on remaining manual items
 * 3. For each recipe item: name-match → merge into manual item, or insert new
 */
export async function mergeRecipeItemsIntoList(
  listId: string,
  mealPlanId: string | null,
  recipeItems: MergedIngredient[],
  pantryNames: Set<string>,
): Promise<GroceryListWithItems> {
  const supabase = await createClient();

  // Link meal plan if provided
  if (mealPlanId) {
    await supabase
      .from("grocery_lists")
      .update({ meal_plan_id: mealPlanId })
      .eq("id", listId);
  }

  // Fetch existing items
  const { data: existingData, error: fetchError } = await supabase
    .from("grocery_list_items")
    .select("*")
    .eq("grocery_list_id", listId);
  if (fetchError) throw fetchError;

  const existingItems = (existingData ?? []).map(rowToGroceryListItem);
  const manualItems = existingItems.filter((i) => i.isManual);
  const recipeDerivedItems = existingItems.filter((i) => !i.isManual);

  // Delete all previous recipe-derived items
  if (recipeDerivedItems.length > 0) {
    const ids = recipeDerivedItems.map((i) => i.id);
    await supabase.from("grocery_list_items").delete().in("id", ids);
  }

  // Clear recipe_ids on all manual items (will re-merge below)
  if (manualItems.length > 0) {
    const manualIds = manualItems.map((i) => i.id);
    await supabase
      .from("grocery_list_items")
      .update({ recipe_ids: [] })
      .in("id", manualIds);
  }

  // Build lookup of manual items by normalized name
  const manualByName = new Map<string, GroceryListItem>();
  for (const item of manualItems) {
    manualByName.set(normalizeIngredientName(item.name), item);
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const mergedManualIds = new Set<string>();

  for (const recipeItem of recipeItems) {
    const normalizedName = recipeItem.name; // already normalized
    const matchingManual = manualByName.get(normalizedName);

    if (matchingManual && !mergedManualIds.has(matchingManual.id)) {
      // Merge: update the manual item with recipe info
      mergedManualIds.add(matchingManual.id);
      const merged = mergeManualAndRecipeQuantity(
        matchingManual.quantity,
        matchingManual.unit,
        recipeItem.quantity,
        recipeItem.unit,
      );
      await supabase
        .from("grocery_list_items")
        .update({
          recipe_ids: recipeItem.recipeIds,
          quantity: merged.quantity,
          unit: merged.unit,
          dismissed: pantryNames.has(normalizedName),
        })
        .eq("id", matchingManual.id);
    } else {
      // Insert new recipe-derived item (sort_order assigned below)
      toInsert.push({
        grocery_list_id: listId,
        name: recipeItem.displayName,
        quantity: recipeItem.quantity,
        unit: recipeItem.unit,
        category: categoryToDb(recipeItem.category),
        store: recipeItem.store,
        checked: false,
        dismissed: pantryNames.has(normalizedName),
        recipe_ids: recipeItem.recipeIds,
        is_manual: false,
        sort_order: 0, // placeholder, assigned below
      });
    }
  }

  if (toInsert.length > 0) {
    // Compute max sort_order per group from remaining manual items
    const groupMaxes = new Map<string, number>();
    for (const item of manualItems) {
      const key = `${item.store}|${item.category}`;
      const current = groupMaxes.get(key) ?? 0;
      if (item.sortOrder > current) groupMaxes.set(key, item.sortOrder);
    }

    // Assign sort_order to new recipe items
    const groupCounters = new Map<string, number>();
    for (const row of toInsert) {
      const key = `${row.store}|${row.category}`;
      const base = groupMaxes.get(key) ?? 0;
      const count = (groupCounters.get(key) ?? 0) + 1;
      groupCounters.set(key, count);
      row.sort_order = base + count * 1000;
    }

    const { error: insertError } = await supabase
      .from("grocery_list_items")
      .insert(toInsert);
    if (insertError) throw insertError;
  }

  // Re-fetch the full list
  const { data: listData, error: listError } = await supabase
    .from("grocery_lists")
    .select("*")
    .eq("id", listId)
    .single();
  if (listError) throw listError;

  const list = rowToGroceryList(listData);
  const items = await fetchListItems(list.id);
  return { list, items };
}

/**
 * Merge manual and recipe quantities.
 * Same unit → sum. Different units → keep recipe (authoritative).
 */
export function mergeManualAndRecipeQuantity(
  manualQty: number | null,
  manualUnit: string | null,
  recipeQty: number | null,
  recipeUnit: string | null,
): { quantity: number | null; unit: string | null } {
  const normManualUnit = normalizeUnit(manualUnit);
  const normRecipeUnit = normalizeUnit(recipeUnit);

  if (normManualUnit === normRecipeUnit) {
    if (manualQty !== null && recipeQty !== null) {
      return {
        quantity: Math.round((manualQty + recipeQty) * 100) / 100,
        unit: normRecipeUnit,
      };
    }
    return {
      quantity: recipeQty ?? manualQty,
      unit: normRecipeUnit ?? normManualUnit,
    };
  }

  // Different units: recipe is authoritative
  return { quantity: recipeQty, unit: normRecipeUnit };
}

export async function addGroceryListItem(
  groceryListId: string,
  item: {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: string;
    store: StoreName;
  },
): Promise<GroceryListItem> {
  const supabase = await createClient();
  const dbCategory = categoryToDb(item.category);

  // Place new item at end of its group
  const { data: maxData } = await supabase
    .from("grocery_list_items")
    .select("sort_order")
    .eq("grocery_list_id", groceryListId)
    .eq("store", item.store)
    .eq("category", dbCategory)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = ((maxData?.sort_order as number) ?? 0) + 1000;

  const { data, error } = await supabase
    .from("grocery_list_items")
    .insert({
      grocery_list_id: groceryListId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: dbCategory,
      store: item.store,
      checked: false,
      dismissed: false,
      recipe_ids: [],
      is_manual: true,
      sort_order: nextSortOrder,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToGroceryListItem(data);
}

export async function updateGroceryListItem(
  itemId: string,
  updates: Partial<{
    name: string;
    quantity: number | null;
    unit: string | null;
    category: string;
    store: StoreName;
    checked: boolean;
    dismissed: boolean;
    sortOrder: number;
  }>,
): Promise<void> {
  const supabase = await createClient();

  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.quantity !== undefined) row.quantity = updates.quantity;
  if (updates.unit !== undefined) row.unit = updates.unit;
  if (updates.category !== undefined) row.category = categoryToDb(updates.category);
  if (updates.store !== undefined) row.store = updates.store;
  if (updates.checked !== undefined) row.checked = updates.checked;
  if (updates.dismissed !== undefined) row.dismissed = updates.dismissed;
  if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

  const { error } = await supabase
    .from("grocery_list_items")
    .update(row)
    .eq("id", itemId);

  if (error) throw error;
}

export async function bulkUpdateSortOrder(
  items: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const supabase = await createClient();
  for (const item of items) {
    const { error } = await supabase
      .from("grocery_list_items")
      .update({ sort_order: item.sortOrder })
      .eq("id", item.id);
    if (error) throw error;
  }
}

export async function deleteGroceryListItem(itemId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("grocery_list_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

export async function deleteGroceryList(listId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("grocery_lists")
    .delete()
    .eq("id", listId);

  if (error) throw error;
}

// ── List-level Updates ──

export async function updateGroceryList(
  listId: string,
  updates: Partial<{ status: GroceryListStatus; completedAt: string | null }>,
): Promise<void> {
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.completedAt !== undefined) row.completed_at = updates.completedAt;

  const { error } = await supabase
    .from("grocery_lists")
    .update(row)
    .eq("id", listId);

  if (error) throw error;
}

/**
 * Smart week defaulting: if the current calendar week's list is completed,
 * return next week instead. Single-hop only.
 */
export async function getSmartWeekStart(
  currentWeekStart: string,
): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grocery_lists")
    .select("week_start")
    .eq("status", "completed")
    .eq("week_start", currentWeekStart)
    .maybeSingle();

  if (data) {
    const d = new Date(currentWeekStart + "T00:00:00");
    d.setDate(d.getDate() + 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return currentWeekStart;
}

// ── Helpers ──

/**
 * Map GroceryDisplayCategory back to an IngredientCategory for DB storage.
 * The DB column uses IngredientCategory values.
 */
const VALID_INGREDIENT_CATEGORIES = new Set<string>([
  "produce", "meat", "seafood", "dairy", "grain",
  "canned", "spice", "oil-vinegar", "condiment", "frozen", "other",
]);

function categoryToDb(category: string): IngredientCategory {
  // Already a valid IngredientCategory — pass through
  if (VALID_INGREDIENT_CATEGORIES.has(category)) {
    return category as IngredientCategory;
  }
  // GroceryDisplayCategory → IngredientCategory
  const map: Record<string, IngredientCategory> = {
    protein: "meat",
    produce: "produce",
    dairy: "dairy",
    snacks: "other",
    other: "other",
  };
  return map[category] ?? "other";
}
