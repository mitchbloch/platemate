import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { GroceryListItem, IngredientCategory, StoreName } from "../types";

function payloadToGroceryListItem(
  payload: Record<string, unknown>,
): GroceryListItem {
  return {
    id: payload.id as string,
    householdId: payload.household_id as string,
    groceryListId: payload.grocery_list_id as string,
    name: payload.name as string,
    quantity: payload.quantity as number | null,
    unit: payload.unit as string | null,
    category: payload.category as IngredientCategory,
    store: payload.store as StoreName,
    checked: payload.checked as boolean,
    dismissed: payload.dismissed as boolean,
    recipeIds: payload.recipe_ids as string[],
    isManual: payload.is_manual as boolean,
    sortOrder: (payload.sort_order as number) ?? 0,
  };
}

export function subscribeToGroceryList(
  supabase: SupabaseClient,
  groceryListId: string,
  callbacks: {
    onUpdate: (item: GroceryListItem) => void;
    onInsert: (item: GroceryListItem) => void;
    onDelete: (oldItem: { id: string }) => void;
  },
): RealtimeChannel {
  return supabase
    .channel(`grocery-list-${groceryListId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "grocery_list_items",
        filter: `grocery_list_id=eq.${groceryListId}`,
      },
      (payload) => {
        callbacks.onUpdate(
          payloadToGroceryListItem(payload.new as Record<string, unknown>),
        );
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "grocery_list_items",
        filter: `grocery_list_id=eq.${groceryListId}`,
      },
      (payload) => {
        callbacks.onInsert(
          payloadToGroceryListItem(payload.new as Record<string, unknown>),
        );
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "grocery_list_items",
        filter: `grocery_list_id=eq.${groceryListId}`,
      },
      (payload) => {
        callbacks.onDelete({ id: (payload.old as Record<string, unknown>).id as string });
      },
    )
    .subscribe();
}
