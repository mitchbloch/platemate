"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { GroceryList, GroceryListItem, IngredientCategory, StoreName } from "@/lib/types";
import { INGREDIENT_TO_GROCERY_CATEGORY, GROCERY_CATEGORY_LABELS, GROCERY_CATEGORY_ORDER } from "@/lib/categoryMap";
import { STORE_LABELS } from "@/lib/types";
import { formatForClipboard } from "@/lib/groceryExport";
import { createClient } from "@/lib/supabase/client";
import { subscribeToGroceryList } from "@/lib/supabase/realtime";

interface GroceryListViewProps {
  initialList: GroceryList | null;
  initialItems: GroceryListItem[];
  initialWeekStart: string;
  hasMeals: boolean;
}

/** Format a week start date as "Week of Mar 23" */
function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Shift a week start by N weeks */
function shiftWeek(weekStart: string, weeks: number): string {
  const date = new Date(weekStart + "T00:00:00");
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split("T")[0];
}

/** Get Sunday of current week */
function getCurrentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

/** Format quantity for display */
function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null && unit === null) return "";
  if (quantity === null) return unit ?? "";
  if (unit === null) return `x${quantity}`;
  return `${quantity} ${unit}`;
}

/** Map IngredientCategory to GroceryDisplayCategory */
function toDisplayCategory(category: IngredientCategory) {
  return INGREDIENT_TO_GROCERY_CATEGORY[category] ?? "other";
}

const NON_TJ_STORES: StoreName[] = ["target", "whole-foods", "hmart", "other"];

export default function GroceryListView({
  initialList,
  initialItems,
  initialWeekStart,
  hasMeals: initialHasMeals,
}: GroceryListViewProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [list, setList] = useState<GroceryList | null>(initialList);
  const [items, setItems] = useState<GroceryListItem[]>(initialItems);
  const [hasMeals, setHasMeals] = useState(initialHasMeals);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null); // category being added to
  const [newItemName, setNewItemName] = useState("");
  const [copied, setCopied] = useState(false);

  const supabaseRef = useRef(createClient());

  // ── Real-time Subscription ──
  const listId = list?.id ?? null;
  useEffect(() => {
    if (!listId) return;

    const supabase = supabaseRef.current;
    const channel = subscribeToGroceryList(supabase, listId, {
      onUpdate: (updatedItem) => {
        setItems((prev) =>
          prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)),
        );
      },
      onInsert: (newItem) => {
        setItems((prev) => {
          // Avoid duplicates (from optimistic updates)
          if (prev.some((i) => i.id === newItem.id)) return prev;
          return [...prev, newItem];
        });
      },
      onDelete: ({ id }) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      },
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [listId]);

  const currentWeekStart = getCurrentWeekStart();
  const isCurrentWeek = weekStart === currentWeekStart;

  // Group items by display category (TJ's items)
  const tjItems = items.filter((i) => i.store === "trader-joes");
  const nonTjItems = items.filter((i) => i.store !== "trader-joes");

  const groupedByCategory = GROCERY_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: GROCERY_CATEGORY_LABELS[cat],
    items: tjItems.filter((i) => toDisplayCategory(i.category) === cat),
  })).filter((g) => g.items.length > 0);

  // Group non-TJ's items by store
  const groupedByStore = NON_TJ_STORES.map((store) => ({
    store,
    label: STORE_LABELS[store],
    items: nonTjItems.filter((i) => i.store === store),
  })).filter((g) => g.items.length > 0);

  // ── Data Fetching ──

  const fetchWeekData = useCallback(async (week: string) => {
    setLoading(true);
    try {
      // Fetch grocery list
      const groceryRes = await fetch(`/api/grocery-lists?week=${week}`);
      if (!groceryRes.ok) throw new Error("Failed to fetch");
      const groceryData = await groceryRes.json();
      setList(groceryData.list ?? null);
      setItems(groceryData.items ?? []);

      // Check if meal plan has meals
      const mealRes = await fetch(`/api/meal-plans?week=${week}`);
      if (mealRes.ok) {
        const mealData = await mealRes.json();
        setHasMeals((mealData.meals ?? []).length > 0);
      }
    } catch {
      setList(null);
      setItems([]);
      setHasMeals(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Navigation ──

  async function navigateWeek(direction: number) {
    const newWeek = shiftWeek(weekStart, direction);
    setWeekStart(newWeek);
    await fetchWeekData(newWeek);
  }

  async function goToCurrentWeek() {
    setWeekStart(currentWeekStart);
    await fetchWeekData(currentWeekStart);
  }

  // ── Generate List ──

  async function generateList() {
    setGenerating(true);
    try {
      const res = await fetch("/api/grocery-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to generate list");
        return;
      }
      const data = await res.json();
      setList(data.list);
      setItems(data.items);
    } catch {
      alert("Failed to generate grocery list");
    } finally {
      setGenerating(false);
    }
  }

  // ── Check/Uncheck ──

  async function toggleCheck(item: GroceryListItem) {
    const newChecked = !item.checked;

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, checked: newChecked } : i)),
    );

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, checked: newChecked }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, checked: !newChecked } : i,
        ),
      );
    }
  }

  // ── Add Item ──

  async function addItem(category: IngredientCategory, store: StoreName = "trader-joes") {
    if (!newItemName.trim() || !list) return;

    const name = newItemName.trim();
    setNewItemName("");
    setAddingItem(null);

    try {
      const res = await fetch(`/api/grocery-lists/${list.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, store }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const newItem = await res.json();
      setItems((prev) => [...prev, newItem]);
    } catch {
      alert("Failed to add item");
    }
  }

  // ── Remove Item ──

  async function removeItem(item: GroceryListItem) {
    // Optimistic removal
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      // Revert
      setItems((prev) => [...prev, item]);
    }
  }

  // ── Change Store ──

  async function changeStore(item: GroceryListItem, newStore: StoreName) {
    const oldStore = item.store;

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, store: newStore } : i)),
    );

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, store: newStore }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      // Revert
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, store: oldStore } : i)),
      );
    }
  }

  // ── Copy to Clipboard ──

  async function copyToClipboard() {
    const text = formatForClipboard(items);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy — try again");
    }
  }

  // ── Render ──

  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;

  return (
    <div className="space-y-6">
      {/* Week Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek(-1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          &larr; Prev
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">
            {formatWeekLabel(weekStart)}
          </h1>
          {!isCurrentWeek && (
            <button
              onClick={goToCurrentWeek}
              className="mt-1 text-xs text-primary hover:text-primary-dark"
            >
              Go to this week
            </button>
          )}
        </div>
        <button
          onClick={() => navigateWeek(1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Next &rarr;
        </button>
      </div>

      {loading && (
        <div className="py-8 text-center text-gray-500">Loading...</div>
      )}

      {!loading && (
        <>
          {/* No meal plan state */}
          {!hasMeals && !list && (
            <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="mb-2 text-gray-500">No meals planned for this week</p>
              <a
                href="/plan"
                className="text-sm font-medium text-primary hover:text-primary-dark"
              >
                Plan some meals first
              </a>
            </div>
          )}

          {/* Has meals but no list generated */}
          {hasMeals && !list && (
            <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="mb-3 text-gray-500">
                Ready to generate your grocery list from this week&apos;s meals
              </p>
              <button
                onClick={generateList}
                disabled={generating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate Grocery List"}
              </button>
            </div>
          )}

          {/* List exists */}
          {list && (
            <>
              {/* Summary + Actions */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {checkedCount}/{totalCount} items checked
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                  >
                    {copied ? "Copied!" : "Copy to Notes"}
                  </button>
                  <button
                    onClick={generateList}
                    disabled={generating}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {generating ? "..." : "Regenerate"}
                  </button>
                </div>
              </div>

              {/* TJ's items grouped by category */}
              {groupedByCategory.map((group) => (
                <div key={group.category}>
                  <h2 className="mb-2 text-sm font-medium text-gray-500">
                    {group.label}
                  </h2>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleCheck(item)}
                        onRemove={() => removeItem(item)}
                        onChangeStore={(store) => changeStore(item, store)}
                      />
                    ))}
                  </div>
                  {/* Inline add */}
                  {addingItem === group.category ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        // Use the first matching IngredientCategory for this display category
                        const dbCat = group.items[0]?.category ?? "other";
                        addItem(dbCat);
                      }}
                      className="mt-1 flex gap-2"
                    >
                      <input
                        autoFocus
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="Add item..."
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        onBlur={() => {
                          if (!newItemName.trim()) setAddingItem(null);
                        }}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                      >
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingItem(group.category);
                        setNewItemName("");
                      }}
                      className="mt-1 w-full rounded-lg border border-dashed border-gray-200 py-1.5 text-xs text-gray-400 hover:border-primary hover:text-primary"
                    >
                      + Add item
                    </button>
                  )}
                </div>
              ))}

              {/* Add new category section (for empty categories like Snacks) */}
              {items.length > 0 && (
                <div>
                  {addingItem === "__new__" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        addItem("other");
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="Add item..."
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        onBlur={() => {
                          if (!newItemName.trim()) setAddingItem(null);
                        }}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                      >
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingItem("__new__");
                        setNewItemName("");
                      }}
                      className="w-full rounded-lg border border-dashed border-gray-200 py-2 text-sm text-gray-400 hover:border-primary hover:text-primary"
                    >
                      + Add item to list
                    </button>
                  )}
                </div>
              )}

              {/* Non-TJ's store sections */}
              {groupedByStore.map((group) => (
                <div key={group.store} className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                  <h2 className="mb-2 text-sm font-medium text-amber-800">
                    {group.label}
                  </h2>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleCheck(item)}
                        onRemove={() => removeItem(item)}
                        onChangeStore={(store) => changeStore(item, store)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ──

function GroceryItemRow({
  item,
  onToggle,
  onRemove,
  onChangeStore,
}: {
  item: GroceryListItem;
  onToggle: () => void;
  onRemove: () => void;
  onChangeStore: (store: StoreName) => void;
}) {
  const [showStoreMenu, setShowStoreMenu] = useState(false);
  const qty = formatQuantity(item.quantity, item.unit);

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 ${
        item.checked ? "opacity-50" : "hover:bg-gray-50"
      }`}
    >
      <input
        type="checkbox"
        checked={item.checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
      />
      <span
        className={`flex-1 text-sm ${
          item.checked ? "text-gray-400 line-through" : "text-gray-900"
        }`}
      >
        {item.name}
      </span>
      {qty && (
        <span className="shrink-0 text-xs text-gray-400">{qty}</span>
      )}

      {/* Store tag (only for non-TJ's or when changing) */}
      <div className="relative">
        <button
          onClick={() => setShowStoreMenu(!showStoreMenu)}
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
            item.store !== "trader-joes"
              ? "bg-amber-100 text-amber-700"
              : "text-gray-300 opacity-0 group-hover:opacity-100"
          }`}
          title="Change store"
        >
          {item.store !== "trader-joes"
            ? STORE_LABELS[item.store]
            : "Store"}
        </button>
        {showStoreMenu && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {(["trader-joes", "target", "whole-foods", "hmart"] as StoreName[]).map(
              (store) => (
                <button
                  key={store}
                  onClick={() => {
                    onChangeStore(store);
                    setShowStoreMenu(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                    item.store === store
                      ? "font-medium text-primary"
                      : "text-gray-700"
                  }`}
                >
                  {STORE_LABELS[store]}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      <button
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        title="Remove"
      >
        &times;
      </button>
    </div>
  );
}
