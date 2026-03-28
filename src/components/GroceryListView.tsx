"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { GroceryList, GroceryListItem, IngredientCategory, PantryItem, PinnedGroceryItem, StoreName } from "@/lib/types";
import { INGREDIENT_TO_GROCERY_CATEGORY, GROCERY_CATEGORY_LABELS, GROCERY_CATEGORY_ORDER } from "@/lib/categoryMap";
import { STORE_LABELS } from "@/lib/types";
import { formatForClipboard } from "@/lib/groceryExport";
import { createClient } from "@/lib/supabase/client";
import { subscribeToGroceryList } from "@/lib/supabase/realtime";
import { useToast, ToastContainer } from "@/components/Toast";

interface GroceryListViewProps {
  initialList: GroceryList | null;
  initialItems: GroceryListItem[];
  initialWeekStart: string;
  hasMeals: boolean;
  initialPantryItems: PantryItem[];
  initialPinnedItems: PinnedGroceryItem[];
}

/** Format a week start date as "Week of Mar 23" */
function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Format a Date as YYYY-MM-DD using local time (avoids UTC shift from toISOString) */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shift a week start by N weeks */
function shiftWeek(weekStart: string, weeks: number): string {
  const date = new Date(weekStart + "T00:00:00");
  date.setDate(date.getDate() + weeks * 7);
  return toLocalDateString(date);
}

/** Get Sunday of current week */
function getCurrentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return toLocalDateString(d);
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
  initialPantryItems,
  initialPinnedItems,
}: GroceryListViewProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [list, setList] = useState<GroceryList | null>(initialList);
  const [items, setItems] = useState<GroceryListItem[]>(initialItems);
  const [hasMeals, setHasMeals] = useState(initialHasMeals);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"edit" | "shop">("edit");
  const [pantryItems, setPantryItems] = useState<PantryItem[]>(initialPantryItems);
  const [excludedExpanded, setExcludedExpanded] = useState(false);
  const [pantryExpanded, setPantryExpanded] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<PinnedGroceryItem[]>(initialPinnedItems);
  const { toasts, showToast } = useToast();

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

  // Split items into active vs dismissed
  const activeItems = items.filter((i) => !i.dismissed);
  const dismissedItems = items.filter((i) => i.dismissed);

  // Group active items by display category (TJ's items)
  const tjItems = activeItems.filter((i) => i.store === "trader-joes");
  const nonTjItems = activeItems.filter((i) => i.store !== "trader-joes");

  const groupedByCategory = GROCERY_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: GROCERY_CATEGORY_LABELS[cat],
    items: tjItems.filter((i) => toDisplayCategory(i.category) === cat),
  })).filter((g) => g.items.length > 0);

  const groupedByStore = NON_TJ_STORES.map((store) => ({
    store,
    label: STORE_LABELS[store],
    items: nonTjItems.filter((i) => i.store === store),
  })).filter((g) => g.items.length > 0);

  // Pantry name set for checking if a dismissed item is a pantry staple
  const pantryNameSet = new Set(pantryItems.map((p) => p.name.toLowerCase().trim()));

  // Pinned name set for identifying pinned staples in the list
  const pinnedNameSet = new Set(pinnedItems.map((p) => p.name.toLowerCase().trim()));

  // Split dismissed items into pantry staples vs other excluded
  const pantryDismissedItems = dismissedItems.filter((i) =>
    pantryNameSet.has(i.name.toLowerCase().trim()),
  );
  const otherDismissedItems = dismissedItems.filter((i) =>
    !pantryNameSet.has(i.name.toLowerCase().trim()),
  );

  // ── Data Fetching ──

  const fetchWeekData = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const groceryRes = await fetch(`/api/grocery-lists?week=${week}`);
      if (!groceryRes.ok) throw new Error("Failed to fetch");
      const groceryData = await groceryRes.json();
      setList(groceryData.list ?? null);
      setItems(groceryData.items ?? []);

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
    setMode("edit");
    setExcludedExpanded(false);
    setPantryExpanded(false);
    await fetchWeekData(newWeek);
  }

  async function goToCurrentWeek() {
    setWeekStart(currentWeekStart);
    setMode("edit");
    setExcludedExpanded(false);
    setPantryExpanded(false);
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
      setMode("edit");
    } catch {
      alert("Failed to generate grocery list");
    } finally {
      setGenerating(false);
    }
  }

  // ── Check/Uncheck (Shop mode) ──

  async function toggleCheck(item: GroceryListItem) {
    const newChecked = !item.checked;
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
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, checked: !newChecked } : i)),
      );
    }
  }

  // ── Dismiss/Restore (Edit mode) ──

  async function dismissItem(item: GroceryListItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, dismissed: true } : i)),
    );

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, dismissed: true }),
      });
      if (!res.ok) throw new Error("Failed to dismiss");
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, dismissed: false } : i)),
      );
    }
  }

  async function restoreItem(item: GroceryListItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, dismissed: false } : i)),
    );

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, dismissed: false }),
      });
      if (!res.ok) throw new Error("Failed to restore");
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, dismissed: true } : i)),
      );
    }
  }

  // ── Mark as Pantry Staple ──

  async function markAsPantryStaple(item: GroceryListItem) {
    await dismissItem(item);

    try {
      const res = await fetch("/api/pantry-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name }),
      });
      if (res.ok) {
        const newPantry = await res.json();
        setPantryItems((prev) => [...prev, newPantry]);
      } else {
        showToast("Failed to save as pantry staple");
      }
    } catch {
      showToast("Failed to save as pantry staple");
    }
  }

  async function moveToPinnedStaples(item: GroceryListItem) {
    try {
      const res = await fetch("/api/pinned-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          category: toDisplayCategory(item.category),
          store: item.store,
          quantity: item.quantity,
          unit: item.unit,
        }),
      });
      if (res.ok) {
        const newPinned = await res.json();
        setPinnedItems((prev) => [...prev, newPinned]);
        showToast(`"${item.name}" added to pinned staples`, "success");
      } else {
        showToast("Failed to add to pinned staples");
      }
    } catch {
      showToast("Failed to add to pinned staples");
    }
  }

  // ── Add Item (Edit mode) ──

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

  // ── Remove Item (Edit mode) ──

  async function removeItem(item: GroceryListItem) {
    const index = items.findIndex((i) => i.id === item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setItems((prev) => {
        const restored = [...prev];
        restored.splice(index, 0, item);
        return restored;
      });
    }
  }

  // ── Change Store (Edit mode) ──

  async function changeStore(item: GroceryListItem, newStore: StoreName) {
    const oldStore = item.store;
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
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, store: oldStore } : i)),
      );
    }
  }

  // ── Copy to Clipboard (Shop mode) ──

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

  const checkedCount = activeItems.filter((i) => i.checked).length;
  const activeCount = activeItems.length;

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} />
      {/* Week Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek(-1)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light hover:text-text"
        >
          &larr; Prev
        </button>
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight text-text">
            {formatWeekLabel(weekStart)}
          </h1>
          {!isCurrentWeek && (
            <button
              onClick={goToCurrentWeek}
              className="mt-1 text-xs text-primary hover:text-primary-dark transition-colors"
            >
              Go to this week
            </button>
          )}
        </div>
        <button
          onClick={() => navigateWeek(1)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light hover:text-text"
        >
          Next &rarr;
        </button>
      </div>

      {loading && (
        <div className="py-8 text-center text-text-muted">
          <div className="spinner mx-auto mb-3 h-6 w-6" />
          Loading...
        </div>
      )}

      {!loading && (
        <>
          {/* No meal plan state */}
          {!hasMeals && !list && (
            <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
              <p className="mb-2 text-text-muted">No meals planned for this week</p>
              <a
                href="/plan"
                className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
              >
                Plan some meals first
              </a>
            </div>
          )}

          {/* Has meals but no list generated */}
          {hasMeals && !list && (
            <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
              <p className="mb-3 text-text-muted">
                Ready to generate your grocery list from this week&apos;s meals
              </p>
              <button
                onClick={generateList}
                disabled={generating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50"
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
                <p className="text-sm text-text-muted">
                  {mode === "shop"
                    ? `${checkedCount}/${activeCount} items checked`
                    : `${activeCount} items`}
                  {dismissedItems.length > 0 && (
                    <span className="ml-1 text-text-muted">
                      ({dismissedItems.length} excluded)
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  {mode === "edit" ? (
                    <>
                      <button
                        onClick={() => setMode("shop")}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
                      >
                        Ready to Shop
                      </button>
                      <button
                        onClick={generateList}
                        disabled={generating}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light disabled:opacity-50"
                      >
                        {generating ? "..." : "Regenerate"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={copyToClipboard}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
                      >
                        {copied ? "Copied!" : "Copy to Notes"}
                      </button>
                      <button
                        onClick={() => setMode("edit")}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light"
                      >
                        Back to Edit
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* TJ's items grouped by category */}
              {groupedByCategory.map((group) => (
                <div key={group.category}>
                  <h2 className="mb-2 text-sm font-medium text-text-muted">
                    {group.label}
                  </h2>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        mode={mode}
                        isPinned={pinnedNameSet.has(item.name.toLowerCase().trim())}
                        onToggle={() => toggleCheck(item)}
                        onDismiss={() => dismissItem(item)}
                        onMarkPantry={() => markAsPantryStaple(item)}
                        onMoveToPinned={() => moveToPinnedStaples(item)}
                        onRemove={() => removeItem(item)}
                        onChangeStore={(store) => changeStore(item, store)}
                      />
                    ))}
                  </div>
                  {/* Inline add (edit mode only) */}
                  {mode === "edit" && (
                    <>
                      {addingItem === group.category ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
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
                            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                            onBlur={() => {
                              if (!newItemName.trim()) setAddingItem(null);
                            }}
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
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
                          className="mt-1 w-full rounded-lg border border-dashed border-border py-1.5 text-xs text-text-muted transition-colors hover:border-primary hover:text-primary"
                        >
                          + Add item
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Add new item (edit mode only) */}
              {mode === "edit" && activeItems.length > 0 && (
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
                        className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                        onBlur={() => {
                          if (!newItemName.trim()) setAddingItem(null);
                        }}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
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
                      className="w-full rounded-lg border border-dashed border-border py-2 text-sm text-text-muted transition-colors hover:border-primary hover:text-primary"
                    >
                      + Add item to list
                    </button>
                  )}
                </div>
              )}

              {/* Non-TJ's store sections */}
              {groupedByStore.map((group) => (
                <div key={group.store} className="rounded-2xl border border-gold-light bg-gold-light/30 p-4">
                  <h2 className="mb-2 text-sm font-medium text-gold">
                    {group.label}
                  </h2>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        mode={mode}
                        isPinned={pinnedNameSet.has(item.name.toLowerCase().trim())}
                        onToggle={() => toggleCheck(item)}
                        onDismiss={() => dismissItem(item)}
                        onMarkPantry={() => markAsPantryStaple(item)}
                        onMoveToPinned={() => moveToPinnedStaples(item)}
                        onRemove={() => removeItem(item)}
                        onChangeStore={(store) => changeStore(item, store)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Pantry staples section (edit mode only) */}
              {mode === "edit" && pantryDismissedItems.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setPantryExpanded(!pantryExpanded)}
                    className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
                  >
                    <span className="text-xs">{pantryExpanded ? "\u25BE" : "\u25B8"}</span>
                    Pantry Staples ({pantryDismissedItems.length})
                  </button>
                  {pantryExpanded && (
                    <div className="mt-2 space-y-1 rounded-2xl border border-accent-light bg-accent-light/30 p-3">
                      {pantryDismissedItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-text-muted">
                              {item.name}
                            </span>
                            {formatQuantity(item.quantity, item.unit) && (
                              <span className="text-xs text-text-muted">
                                {formatQuantity(item.quantity, item.unit)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => restoreItem(item)}
                            className="text-xs font-medium text-primary hover:text-primary-dark transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Other excluded items section (edit mode only) */}
              {mode === "edit" && otherDismissedItems.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setExcludedExpanded(!excludedExpanded)}
                    className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
                  >
                    <span className="text-xs">{excludedExpanded ? "\u25BE" : "\u25B8"}</span>
                    Excluded ({otherDismissedItems.length})
                  </button>
                  {excludedExpanded && (
                    <div className="mt-2 space-y-1 rounded-2xl border border-border-light bg-border-light/50 p-3">
                      {otherDismissedItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-text-muted">
                              {item.name}
                            </span>
                            {formatQuantity(item.quantity, item.unit) && (
                              <span className="text-xs text-text-muted">
                                {formatQuantity(item.quantity, item.unit)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => restoreItem(item)}
                            className="text-xs font-medium text-primary hover:text-primary-dark transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
  mode,
  isPinned,
  onToggle,
  onDismiss,
  onMarkPantry,
  onMoveToPinned,
  onRemove,
  onChangeStore,
}: {
  item: GroceryListItem;
  mode: "edit" | "shop";
  isPinned: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onMarkPantry: () => void;
  onMoveToPinned: () => void;
  onRemove: () => void;
  onChangeStore: (store: StoreName) => void;
}) {
  const [showStoreMenu, setShowStoreMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const storeMenuRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useClickOutside(storeMenuRef, () => setShowStoreMenu(false));
  useClickOutside(actionsRef, () => setShowActions(false));
  const qty = formatQuantity(item.quantity, item.unit);

  if (mode === "shop") {
    // Shop mode: checkbox + name + qty, minimal controls
    return (
      <div
        onClick={onToggle}
        role="button"
        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
          item.checked ? "opacity-50" : "hover:bg-border-light"
        }`}
      >
        <input
          type="checkbox"
          checked={item.checked}
          readOnly
          className="pointer-events-none h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
        />
        <span
          className={`flex-1 text-sm ${
            item.checked ? "text-text-muted line-through" : "text-text"
          }`}
        >
          {item.name}
        </span>
        {isPinned && (
          <span className="shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-xs text-primary">
            <PinIcon /> pinned
          </span>
        )}
        {qty && (
          <span className="shrink-0 text-xs text-text-muted">{qty}</span>
        )}
        {item.store !== "trader-joes" && (
          <span className="shrink-0 rounded-md bg-gold-light px-1.5 py-0.5 text-xs text-gold">
            {STORE_LABELS[item.store]}
          </span>
        )}
      </div>
    );
  }

  // Edit mode: dismiss, store change, remove, mark pantry
  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-border-light">
      <span className="flex-1 text-sm text-text">{item.name}</span>
      {isPinned && (
        <span className="shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-xs text-primary">
          <PinIcon /> pinned
        </span>
      )}
      {qty && (
        <span className="shrink-0 text-xs text-text-muted">{qty}</span>
      )}

      {/* Store tag */}
      <div className="relative" ref={storeMenuRef}>
        <button
          onClick={() => setShowStoreMenu(!showStoreMenu)}
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs transition-colors ${
            item.store !== "trader-joes"
              ? "bg-gold-light text-gold"
              : "text-text-muted hover:text-text-secondary"
          }`}
          title="Change store"
        >
          {item.store !== "trader-joes"
            ? STORE_LABELS[item.store]
            : "Store"}
        </button>
        {showStoreMenu && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface py-1 shadow-warm-lg">
            {(["trader-joes", "target", "whole-foods", "hmart"] as StoreName[]).map(
              (store) => (
                <button
                  key={store}
                  onClick={() => {
                    onChangeStore(store);
                    setShowStoreMenu(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-border-light ${
                    item.store === store
                      ? "font-medium text-primary"
                      : "text-text-secondary"
                  }`}
                >
                  {STORE_LABELS[store]}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {/* Actions menu */}
      <div className="relative" ref={actionsRef}>
        <button
          onClick={() => setShowActions(!showActions)}
          className="shrink-0 rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
          title="Actions"
        >
          &middot;&middot;&middot;
        </button>
        {showActions && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface py-1 shadow-warm-lg">
            <button
              onClick={() => {
                onDismiss();
                setShowActions(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-border-light"
            >
              Have this already
            </button>
            <button
              onClick={() => {
                onMarkPantry();
                setShowActions(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-border-light"
            >
              Move to pantry staples
            </button>
            {!isPinned && (
              <button
                onClick={() => {
                  onMoveToPinned();
                  setShowActions(false);
                }}
                className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-border-light"
              >
                Move to pinned staples
              </button>
            )}
            <button
              onClick={() => {
                onRemove();
                setShowActions(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs text-danger transition-colors hover:bg-border-light"
            >
              Remove from list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg
      className="mr-0.5 inline-block h-3 w-3"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.71-.71-3.18 3.18a3.5 3.5 0 0 1-1.399.948l-.046.016-1.415 5.66a.5.5 0 0 1-.848.26L4.5 13.55l-3.896 3.896a.5.5 0 0 1-.708-.707l3.897-3.897-2.329-2.328a.5.5 0 0 1 .26-.849l5.66-1.415.015-.046a3.5 3.5 0 0 1 .947-1.398l3.18-3.18-.71-.71a.5.5 0 0 1 .147-.354z" />
    </svg>
  );
}
