import { createClient } from "./supabase/server";
import { deduplicateIngredients } from "./ingredientMerge";
import type {
  GroceryList,
  GroceryListItem,
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
    mealPlanId: row.meal_plan_id as string,
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
  };
}

// ── Read Operations ──

export async function getGroceryListByMealPlan(
  mealPlanId: string,
): Promise<GroceryListWithItems | null> {
  const supabase = await createClient();

  const { data: listData, error: listError } = await supabase
    .from("grocery_lists")
    .select("*")
    .eq("meal_plan_id", mealPlanId)
    .maybeSingle();

  if (listError) throw listError;
  if (!listData) return null;

  const list = rowToGroceryList(listData);

  const { data: itemsData, error: itemsError } = await supabase
    .from("grocery_list_items")
    .select("*")
    .eq("grocery_list_id", list.id)
    .order("category")
    .order("name");

  if (itemsError) throw itemsError;

  return {
    list,
    items: (itemsData ?? []).map(rowToGroceryListItem),
  };
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

export async function saveGroceryList(
  mealPlanId: string,
  items: MergedIngredient[],
  pantryNames: Set<string> = new Set(),
): Promise<GroceryListWithItems> {
  const supabase = await createClient();

  // Delete existing list for this meal plan (regeneration)
  await supabase
    .from("grocery_lists")
    .delete()
    .eq("meal_plan_id", mealPlanId);

  // Create new list
  const { data: listData, error: listError } = await supabase
    .from("grocery_lists")
    .insert({ meal_plan_id: mealPlanId })
    .select()
    .single();

  if (listError) throw listError;
  const list = rowToGroceryList(listData);

  // Insert items (auto-dismiss pantry staples)
  const rows = items.map((item) => ({
    grocery_list_id: list.id,
    name: item.displayName,
    quantity: item.quantity,
    unit: item.unit,
    category: categoryToDb(item.category),
    store: item.store,
    checked: false,
    dismissed: pantryNames.has(item.name.toLowerCase().trim()),
    recipe_ids: item.recipeIds,
  }));

  if (rows.length > 0) {
    const { error: itemsError } = await supabase
      .from("grocery_list_items")
      .insert(rows);

    if (itemsError) throw itemsError;
  }

  // Re-fetch to get IDs
  const result = await getGroceryListByMealPlan(mealPlanId);
  if (!result) throw new Error("Failed to fetch saved grocery list");
  return result;
}

export async function addGroceryListItem(
  groceryListId: string,
  item: {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: IngredientCategory;
    store: StoreName;
  },
): Promise<GroceryListItem> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grocery_list_items")
    .insert({
      grocery_list_id: groceryListId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      store: item.store,
      checked: false,
      recipe_ids: [],
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
    category: IngredientCategory;
    store: StoreName;
    checked: boolean;
    dismissed: boolean;
  }>,
): Promise<void> {
  const supabase = await createClient();

  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.quantity !== undefined) row.quantity = updates.quantity;
  if (updates.unit !== undefined) row.unit = updates.unit;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.store !== undefined) row.store = updates.store;
  if (updates.checked !== undefined) row.checked = updates.checked;
  if (updates.dismissed !== undefined) row.dismissed = updates.dismissed;

  const { error } = await supabase
    .from("grocery_list_items")
    .update(row)
    .eq("id", itemId);

  if (error) throw error;
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

// ── Helpers ──

/**
 * Map GroceryDisplayCategory back to an IngredientCategory for DB storage.
 * The DB column uses IngredientCategory values.
 */
function categoryToDb(displayCategory: string): IngredientCategory {
  const map: Record<string, IngredientCategory> = {
    protein: "meat",
    produce: "produce",
    dairy: "dairy",
    snacks: "other",
    other: "other",
  };
  return map[displayCategory] ?? "other";
}
