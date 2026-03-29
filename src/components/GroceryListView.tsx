"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { GroceryList, GroceryListItem, GroceryDisplayCategory, IngredientCategory, PantryItem, PinnedGroceryItem, StoreName } from "@/lib/types";
import { INGREDIENT_TO_GROCERY_CATEGORY, GROCERY_CATEGORY_LABELS, GROCERY_CATEGORY_ORDER } from "@/lib/categoryMap";
import { STORE_LABELS } from "@/lib/types";
import { formatForClipboard } from "@/lib/groceryExport";
import { createClient } from "@/lib/supabase/client";
import { subscribeToGroceryList } from "@/lib/supabase/realtime";
import { useToast, ToastContainer } from "@/components/Toast";
import CompletionModal from "@/components/CompletionModal";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

interface FrequentItem {
  name: string;
  count: number;
  category: IngredientCategory;
  store: StoreName;
}

interface GroceryListViewProps {
  initialList: GroceryList | null;
  initialItems: GroceryListItem[];
  initialWeekStart: string;
  hasMeals: boolean;
  hasRecipeItems: boolean;
  initialPantryItems: PantryItem[];
  initialPinnedItems: PinnedGroceryItem[];
  initialFrequentItems: FrequentItem[];
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

/** Store badge color classes */
function storeBadgeClasses(store: StoreName): string {
  switch (store) {
    case "trader-joes": return "bg-border-light text-text-muted";
    case "target": return "bg-danger-light text-danger";
    case "whole-foods": return "bg-accent-light text-accent";
    case "hmart": return "bg-primary-light text-primary";
    case "other": return "bg-gold-light text-gold";
  }
}

const NON_TJ_STORES: StoreName[] = ["target", "whole-foods", "hmart", "other"];

export default function GroceryListView({
  initialList,
  initialItems,
  initialWeekStart,
  hasMeals: initialHasMeals,
  hasRecipeItems: initialHasRecipeItems,
  initialPantryItems,
  initialPinnedItems,
  initialFrequentItems,
}: GroceryListViewProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [list, setList] = useState<GroceryList | null>(initialList);
  const [items, setItems] = useState<GroceryListItem[]>(initialItems);
  const [hasMeals, setHasMeals] = useState(initialHasMeals);
  const [hasRecipeItems, setHasRecipeItems] = useState(initialHasRecipeItems);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<GroceryDisplayCategory>("other");
  const [newItemStore, setNewItemStore] = useState<StoreName>("trader-joes");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemIsWeekly, setNewItemIsWeekly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"edit" | "shop">(
    initialList?.status === "shop" ? "shop" : "edit",
  );
  const [pantryItems, setPantryItems] = useState<PantryItem[]>(initialPantryItems);
  const [excludedExpanded, setExcludedExpanded] = useState(false);
  const [pantryExpanded, setPantryExpanded] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<PinnedGroceryItem[]>(initialPinnedItems);
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>(initialFrequentItems);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [closeKey, setCloseKey] = useState(0);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const { toasts, showToast } = useToast();

  const supabaseRef = useRef(createClient());
  const hasInteractedRef = useRef(false);

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

  // ── Completion Detection ──
  // checkedCount/activeCount computed early for the effect
  const activeItemsForEffect = items.filter((i) => !i.dismissed);
  const checkedCountForEffect = activeItemsForEffect.filter((i) => i.checked).length;
  const activeCountForEffect = activeItemsForEffect.length;

  useEffect(() => {
    if (
      mode === "shop" &&
      hasInteractedRef.current &&
      activeCountForEffect > 0 &&
      checkedCountForEffect === activeCountForEffect
    ) {
      setShowCompletionModal(true);
    }
  }, [mode, checkedCountForEffect, activeCountForEffect]);

  // Reset interaction tracking on week change
  useEffect(() => {
    hasInteractedRef.current = false;
    setShowCompletionModal(false);
  }, [weekStart]);

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
    items: tjItems
      .filter((i) => toDisplayCategory(i.category) === cat)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.items.length > 0);

  const groupedByStore = NON_TJ_STORES.map((store) => ({
    store,
    label: STORE_LABELS[store],
    items: nonTjItems
      .filter((i) => i.store === store)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.items.length > 0);

  // Pantry name set for checking if a dismissed item is a pantry staple
  const pantryNameSet = new Set(pantryItems.map((p) => p.name.toLowerCase().trim()));

  // Weekly staple name set for identifying weekly staples in the list
  const pinnedNameSet = new Set(pinnedItems.map((p) => p.name.toLowerCase().trim()));

  // Split dismissed items into pantry staples vs other excluded
  const pantryDismissedItems = dismissedItems.filter((i) =>
    pantryNameSet.has(i.name.toLowerCase().trim()),
  );
  const otherDismissedItems = dismissedItems.filter((i) =>
    !pantryNameSet.has(i.name.toLowerCase().trim()),
  );

  // ── Close dropdowns on mode/week change ──
  function bumpCloseKey() {
    setCloseKey((k) => k + 1);
  }

  // ── Data Fetching ──

  const fetchWeekData = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const groceryRes = await fetch(`/api/grocery-lists?week=${week}`);
      if (!groceryRes.ok) throw new Error("Failed to fetch");
      const groceryData = await groceryRes.json();
      setList(groceryData.list);
      setItems(groceryData.items ?? []);
      setHasRecipeItems(
        (groceryData.items ?? []).some(
          (i: GroceryListItem) => i.recipeIds.length > 0,
        ),
      );

      // Restore mode from persisted status
      const status = groceryData.list?.status;
      if (status === "completed") {
        setMode("edit"); // completed weeks show in read-only edit view
      } else if (status === "shop") {
        setMode("shop");
      } else {
        setMode("edit");
      }

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
    setExcludedExpanded(false);
    setPantryExpanded(false);
    setAddingItem(null);
    bumpCloseKey();
    await fetchWeekData(newWeek);
  }

  async function goToCurrentWeek() {
    setWeekStart(currentWeekStart);
    setExcludedExpanded(false);
    setPantryExpanded(false);
    setAddingItem(null);
    bumpCloseKey();
    await fetchWeekData(currentWeekStart);
  }

  async function switchMode(newMode: "edit" | "shop") {
    setMode(newMode);
    setAddingItem(null);
    bumpCloseKey();

    if (list) {
      try {
        await fetch(`/api/grocery-lists/${list.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newMode }),
        });
        setList({ ...list, status: newMode });
      } catch {
        // Silent fail — mode is still set locally
      }
    }
  }

  // ── Completion Flow ──

  function dismissCompletionModal() {
    setShowCompletionModal(false);
  }

  async function completeWeek() {
    if (!list) return;
    setShowCompletionModal(false);

    try {
      await fetch(`/api/grocery-lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completedAt: new Date().toISOString(),
        }),
      });
      setList({ ...list, status: "completed", completedAt: new Date().toISOString() });
    } catch {
      showToast("Failed to mark week as complete");
      return;
    }

    // Navigate to next week
    const nextWeek = shiftWeek(weekStart, 1);
    setWeekStart(nextWeek);
    hasInteractedRef.current = false;
    await fetchWeekData(nextWeek);
  }

  async function reopenWeek() {
    if (!list) return;
    try {
      await fetch(`/api/grocery-lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "edit", completedAt: null }),
      });
      setList({ ...list, status: "edit", completedAt: null });
      setMode("edit");
    } catch {
      showToast("Failed to reopen week");
    }
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
      setHasRecipeItems(true);
      setMode("edit");
      bumpCloseKey();
    } catch {
      alert("Failed to generate grocery list");
    } finally {
      setGenerating(false);
    }
  }

  // ── Check/Uncheck (Shop mode) ──

  async function toggleCheck(item: GroceryListItem) {
    hasInteractedRef.current = true;
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

  async function moveToWeeklyStaples(item: GroceryListItem) {
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
        showToast(`"${item.name}" added to weekly staples`, "success");
      } else {
        showToast("Failed to add to weekly staples");
      }
    } catch {
      showToast("Failed to add to weekly staples");
    }
  }

  async function removeWeeklyStaple(name: string) {
    const item = pinnedItems.find((p) => p.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (!item) return;

    setPinnedItems((prev) => prev.filter((p) => p.id !== item.id));
    try {
      const res = await fetch("/api/pinned-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) {
        setPinnedItems((prev) => [...prev, item]);
        showToast("Failed to remove weekly staple");
      }
    } catch {
      setPinnedItems((prev) => [...prev, item]);
    }
  }

  // ── Add Item (Edit mode) — unified flow ──

  async function addItem() {
    if (!newItemName.trim() || !list) return;

    const name = newItemName.trim();
    const category = newItemCategory;
    const store = newItemStore;
    const quantity = parseFloat(newItemQuantity) || null;
    const unit = newItemUnit.trim() || null;
    const isWeekly = newItemIsWeekly;

    // Reset form
    setNewItemName("");
    setNewItemQuantity("");
    setNewItemUnit("");
    setNewItemCategory("other");
    setNewItemStore("trader-joes");
    setNewItemIsWeekly(false);
    setAddingItem(null);

    try {
      // Add to grocery list
      const res = await fetch(`/api/grocery-lists/${list.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, store, quantity, unit }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const newItem = await res.json();
      setItems((prev) => [...prev, newItem]);

      // Also pin as weekly staple if toggled
      if (isWeekly) {
        const pinRes = await fetch("/api/pinned-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category, store }),
        });
        if (pinRes.ok) {
          const pinned = await pinRes.json();
          setPinnedItems((prev) => [...prev, pinned]);
          setFrequentItems((prev) => prev.filter((f) => f.name.toLowerCase() !== name.toLowerCase()));
          showToast(`"${name}" added as weekly staple`, "success");
        }
      }
    } catch {
      alert("Failed to add item");
    }
  }

  // Quick-add frequent item as weekly staple
  async function quickAddFrequent(freq: FrequentItem) {
    try {
      const res = await fetch("/api/pinned-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: freq.name,
          category: "other",
          store: freq.store,
        }),
      });
      if (res.ok) {
        const pinned = await res.json();
        setPinnedItems((prev) => [...prev, pinned]);
        setFrequentItems((prev) => prev.filter((f) => f.name.toLowerCase() !== freq.name.toLowerCase()));
        showToast(`"${freq.name}" added as weekly staple`, "success");
      }
    } catch {
      showToast("Failed to add weekly staple");
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

  // ── Edit Item (Edit mode) ──

  async function editItem(
    item: GroceryListItem,
    updates: { name: string; quantity: number | null; unit: string | null; category: string; store: StoreName },
  ) {
    const oldItem = { ...item };
    // Map display category to ingredient category for optimistic update
    const DISPLAY_TO_INGREDIENT: Record<string, IngredientCategory> = {
      protein: "meat",
      produce: "produce",
      dairy: "dairy",
      snacks: "other",
      other: "other",
    };
    const dbCategory = DISPLAY_TO_INGREDIENT[updates.category] ?? (updates.category as IngredientCategory);
    // Optimistic update with typed category
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, ...updates, category: dbCategory } : i)),
    );
    setEditingItemId(null);

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? oldItem : i)),
      );
      showToast("Failed to update item", "error");
    }
  }

  // ── Reorder (Edit mode) ──

  async function handleReorder(groupItems: GroceryListItem[], activeId: string, overId: string) {
    const oldIndex = groupItems.findIndex((i) => i.id === activeId);
    const newIndex = groupItems.findIndex((i) => i.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(groupItems, oldIndex, newIndex);

    // Assign new sort_order values (1000, 2000, 3000...)
    const updates = reordered.map((item, idx) => ({
      id: item.id,
      sortOrder: (idx + 1) * 1000,
    }));

    // Optimistic update
    const prevItems = [...items];
    setItems((prev) =>
      prev.map((item) => {
        const update = updates.find((u) => u.id === item.id);
        return update ? { ...item, sortOrder: update.sortOrder } : item;
      }),
    );

    try {
      const res = await fetch(`/api/grocery-lists/${list!.id}/items/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updates }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
    } catch {
      setItems(prevItems);
      showToast("Failed to save new order");
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

  // ── Add Item Form (unified) ──

  function renderAddItemForm(defaultCategory: IngredientCategory | null) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (defaultCategory && newItemCategory === "other") {
            setNewItemCategory(toDisplayCategory(defaultCategory) as GroceryDisplayCategory);
          }
          addItem();
        }}
        onBlur={(e) => {
          // Close form only if focus leaves the form entirely and name is empty
          if (!e.currentTarget.contains(e.relatedTarget) && !newItemName.trim()) {
            setTimeout(() => setAddingItem(null), 150);
          }
        }}
        className="mt-2 space-y-2 rounded-xl border border-border bg-surface p-3"
      >
        <input
          autoFocus
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Item name..."
          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
        <div className="flex gap-2">
          <input
            value={newItemQuantity}
            onChange={(e) => setNewItemQuantity(e.target.value)}
            placeholder="Qty"
            type="number"
            min="0"
            step="any"
            className="w-16 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
          <input
            value={newItemUnit}
            onChange={(e) => setNewItemUnit(e.target.value)}
            placeholder="Unit (lbs, oz, pkg...)"
            className="w-40 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value as GroceryDisplayCategory)}
            className="rounded-lg border border-border bg-bg px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            {Object.entries(GROCERY_CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={newItemStore}
            onChange={(e) => setNewItemStore(e.target.value as StoreName)}
            className="rounded-lg border border-border bg-bg px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            {Object.entries(STORE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={newItemIsWeekly}
              onChange={(e) => setNewItemIsWeekly(e.target.checked)}
              className="h-3 w-3 rounded border-border text-primary focus:ring-primary"
            />
            Weekly staple
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAddingItem(null)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // ── Render ──

  const checkedCount = activeItems.filter((i) => i.checked).length;
  const activeCount = activeItems.length;
  const isCompleted = list?.status === "completed";

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
            {isCompleted && (
              <span className="ml-2 inline-block rounded-full bg-accent-light px-2 py-0.5 align-middle text-xs font-medium text-accent">
                Completed
              </span>
            )}
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
          {/* Generate from meals banner */}
          {hasMeals && !hasRecipeItems && !isCompleted && (
            <div className="flex items-center justify-between rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-5 py-4">
              <p className="text-sm text-text-secondary">
                Meals planned &mdash; ready to generate grocery items from recipes
              </p>
              <button
                onClick={generateList}
                disabled={generating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate from Meals"}
              </button>
            </div>
          )}

          {/* List content */}
          {list && (
            <>
              {/* Summary + Actions */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-muted">
                  {isCompleted
                    ? `${activeCount} items`
                    : mode === "shop"
                      ? `${checkedCount}/${activeCount} items checked`
                      : `${activeCount} items`}
                  {dismissedItems.length > 0 && (
                    <span className="ml-1 text-text-muted">
                      ({dismissedItems.length} excluded)
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  {isCompleted ? (
                    <button
                      onClick={reopenWeek}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light"
                    >
                      Reopen
                    </button>
                  ) : mode === "edit" ? (
                    <>
                      <button
                        onClick={() => switchMode("shop")}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
                      >
                        Ready to Shop
                      </button>
                      {hasMeals && hasRecipeItems && (
                        <button
                          onClick={generateList}
                          disabled={generating}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light disabled:opacity-50"
                        >
                          {generating ? "..." : "Regenerate"}
                        </button>
                      )}
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
                        onClick={() => switchMode("edit")}
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
                  <SortableItemGroup
                    items={group.items}
                    enabled={mode === "edit" && !isCompleted}
                    onReorder={handleReorder}
                  >
                    {group.items.map((item) => (
                      <SortableItemWrapper key={item.id} id={item.id} enabled={mode === "edit" && !isCompleted}>
                        <GroceryItemRow
                          item={item}
                          mode={mode}
                          isPinned={pinnedNameSet.has(item.name.toLowerCase().trim())}
                          isCompleted={!!isCompleted}
                          closeKey={closeKey}
                          onToggle={() => toggleCheck(item)}
                          onDismiss={() => dismissItem(item)}
                          onMarkPantry={() => markAsPantryStaple(item)}
                          onMoveToWeekly={() => moveToWeeklyStaples(item)}
                          onRemoveWeekly={() => removeWeeklyStaple(item.name)}
                          onRemove={() => removeItem(item)}
                          onChangeStore={(store) => changeStore(item, store)}
                          isEditing={editingItemId === item.id}
                          onStartEdit={() => setEditingItemId(item.id)}
                          onSaveEdit={(updates) => editItem(item, updates)}
                          onCancelEdit={() => setEditingItemId(null)}
                        />
                      </SortableItemWrapper>
                    ))}
                  </SortableItemGroup>
                  {/* Inline add (edit mode only) */}
                  {mode === "edit" && !isCompleted && (
                    <>
                      {addingItem === group.category ? (
                        renderAddItemForm(group.items[0]?.category ?? null)
                      ) : (
                        <button
                          onClick={() => {
                            setAddingItem(group.category);
                            setNewItemName("");
                            setNewItemCategory(toDisplayCategory(group.items[0]?.category ?? "other") as GroceryDisplayCategory);
                            setNewItemStore("trader-joes");
                            setNewItemIsWeekly(false);
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
              {mode === "edit" && !isCompleted && activeItems.length > 0 && (
                <div>
                  {addingItem === "__new__" ? (
                    renderAddItemForm(null)
                  ) : (
                    <button
                      onClick={() => {
                        setAddingItem("__new__");
                        setNewItemName("");
                        setNewItemCategory("other");
                        setNewItemStore("trader-joes");
                        setNewItemIsWeekly(false);
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
                  <SortableItemGroup
                    items={group.items}
                    enabled={mode === "edit" && !isCompleted}
                    onReorder={handleReorder}
                  >
                    {group.items.map((item) => (
                      <SortableItemWrapper key={item.id} id={item.id} enabled={mode === "edit" && !isCompleted}>
                        <GroceryItemRow
                          item={item}
                          mode={mode}
                          isPinned={pinnedNameSet.has(item.name.toLowerCase().trim())}
                          isCompleted={!!isCompleted}
                          closeKey={closeKey}
                          onToggle={() => toggleCheck(item)}
                          onDismiss={() => dismissItem(item)}
                          onMarkPantry={() => markAsPantryStaple(item)}
                          onMoveToWeekly={() => moveToWeeklyStaples(item)}
                          onRemoveWeekly={() => removeWeeklyStaple(item.name)}
                          onRemove={() => removeItem(item)}
                          onChangeStore={(store) => changeStore(item, store)}
                          isEditing={editingItemId === item.id}
                          onStartEdit={() => setEditingItemId(item.id)}
                          onSaveEdit={(updates) => editItem(item, updates)}
                          onCancelEdit={() => setEditingItemId(null)}
                        />
                      </SortableItemWrapper>
                    ))}
                  </SortableItemGroup>
                </div>
              ))}

              {/* Frequent items — quick-add as weekly staples */}
              {mode === "edit" && !isCompleted && frequentItems.length > 0 && (
                <div className="rounded-xl bg-primary-light/50 p-3">
                  <h3 className="mb-1.5 text-xs font-medium text-primary">
                    Frequently bought
                  </h3>
                  <p className="mb-2 text-xs text-text-muted">
                    These appeared in 3+ recent lists. Add as weekly staples?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {frequentItems.map((item) => (
                      <button
                        key={item.name}
                        onClick={() => quickAddFrequent(item)}
                        className="rounded-full border border-primary/20 bg-surface px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:bg-primary-light/50"
                      >
                        {item.name}
                        <span className="ml-1 text-text-muted">({item.count}x)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Weekly staples management (edit mode) */}
              {mode === "edit" && !isCompleted && pinnedItems.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-warm">
                  <h2 className="mb-2 font-display text-sm font-semibold text-text">
                    Weekly Staples
                  </h2>
                  <p className="mb-3 text-xs text-text-muted">
                    Auto-added to every grocery list.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {pinnedItems.map((pinned) => {
                      const matchingItem = items.find(
                        (i) => i.name.toLowerCase().trim() === pinned.name.toLowerCase().trim() && !i.dismissed,
                      );
                      if (!matchingItem) return null;
                      return (
                        <span
                          key={pinned.id}
                          className="group flex items-center gap-1 rounded-full border border-primary/20 bg-primary-light/30 px-2.5 py-1 text-xs text-primary"
                        >
                          {pinned.name}
                          {pinned.store !== "trader-joes" && (
                            <span className={`ml-0.5 rounded px-1 py-0.5 text-[10px] ${storeBadgeClasses(pinned.store)}`}>
                              {STORE_LABELS[pinned.store]}
                            </span>
                          )}
                          <button
                            onClick={() => dismissItem(matchingItem)}
                            className="ml-0.5 text-primary/40 transition-colors hover:text-danger"
                            title="Skip this week"
                          >
                            &times;
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pantry staples section (edit mode only) */}
              {mode === "edit" && !isCompleted && pantryDismissedItems.length > 0 && (
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
                          <div className="flex gap-3">
                            <button
                              onClick={() => restoreItem(item)}
                              className="text-xs font-medium text-primary hover:text-primary-dark transition-colors"
                            >
                              Restore
                            </button>
                            <button
                              onClick={async () => {
                                await restoreItem(item);
                                setEditingItemId(item.id);
                              }}
                              className="text-xs font-medium text-text-secondary hover:text-text transition-colors"
                            >
                              Restore &amp; Edit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Other excluded items section (edit mode only) */}
              {mode === "edit" && !isCompleted && otherDismissedItems.length > 0 && (
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
      {showCompletionModal && (
        <CompletionModal
          onGoBack={dismissCompletionModal}
          onComplete={completeWeek}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function GroceryItemRow({
  item,
  mode,
  isPinned,
  isCompleted,
  closeKey,
  onToggle,
  onDismiss,
  onMarkPantry,
  onMoveToWeekly,
  onRemoveWeekly,
  onRemove,
  onChangeStore,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  item: GroceryListItem;
  mode: "edit" | "shop";
  isPinned: boolean;
  isCompleted: boolean;
  closeKey: number;
  onToggle: () => void;
  onDismiss: () => void;
  onMarkPantry: () => void;
  onMoveToWeekly: () => void;
  onRemoveWeekly: () => void;
  onRemove: () => void;
  onChangeStore: (store: StoreName) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (updates: { name: string; quantity: number | null; unit: string | null; category: string; store: StoreName }) => void;
  onCancelEdit: () => void;
}) {
  const [showStoreMenu, setShowStoreMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQuantity, setEditQuantity] = useState(item.quantity?.toString() ?? "");
  const [editUnit, setEditUnit] = useState(item.unit ?? "");
  const [editCategory, setEditCategory] = useState(toDisplayCategory(item.category));
  const [editStore, setEditStore] = useState(item.store);
  const storeMenuRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useClickOutside(storeMenuRef, () => setShowStoreMenu(false));
  useClickOutside(actionsRef, () => setShowActions(false));
  const qty = formatQuantity(item.quantity, item.unit);

  // Close menus when closeKey changes (mode switch, week nav, etc.)
  useEffect(() => {
    setShowStoreMenu(false);
    setShowActions(false);
  }, [closeKey]);

  // Reset edit form when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditName(item.name);
      setEditQuantity(item.quantity?.toString() ?? "");
      setEditUnit(item.unit ?? "");
      setEditCategory(toDisplayCategory(item.category));
      setEditStore(item.store);
    }
  }, [isEditing, item.name, item.quantity, item.unit, item.category, item.store]);

  function handleSaveEdit() {
    if (!editName.trim()) return;
    onSaveEdit({
      name: editName.trim(),
      quantity: parseFloat(editQuantity) || null,
      unit: editUnit.trim() || null,
      category: editCategory,
      store: editStore,
    });
  }

  // Completed: read-only view, no actions
  if (isCompleted) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 opacity-60">
        <span className="flex-1 text-sm text-text-muted line-through">
          {item.name}
        </span>
        {qty && (
          <span className="shrink-0 text-xs font-medium text-text-muted">{qty}</span>
        )}
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${storeBadgeClasses(item.store)}`}>
          {STORE_LABELS[item.store]}
        </span>
      </div>
    );
  }

  if (mode === "shop") {
    // Shop mode: click entire row to toggle
    return (
      <div
        onClick={onToggle}
        role="button"
        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
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
        {qty && (
          <span className={`shrink-0 text-xs font-medium ${item.checked ? "text-text-muted" : "text-text-secondary"}`}>{qty}</span>
        )}
        {isPinned && (
          <span className="shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">
            weekly
          </span>
        )}
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${storeBadgeClasses(item.store)}`}>
          {STORE_LABELS[item.store]}
        </span>
      </div>
    );
  }

  // Edit mode: inline editing form
  if (isEditing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancelEdit();
        }}
        className="space-y-2 rounded-xl border border-primary bg-surface p-3"
      >
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Item name..."
          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
        <div className="flex gap-2">
          <input
            value={editQuantity}
            onChange={(e) => setEditQuantity(e.target.value)}
            placeholder="Qty"
            type="number"
            min="0"
            step="any"
            className="w-16 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
          <input
            value={editUnit}
            onChange={(e) => setEditUnit(e.target.value)}
            placeholder="Unit (lbs, oz, pkg...)"
            className="w-40 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value as GroceryDisplayCategory)}
            className="rounded-lg border border-border bg-bg px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            {Object.entries(GROCERY_CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={editStore}
            onChange={(e) => setEditStore(e.target.value as StoreName)}
            className="rounded-lg border border-border bg-bg px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
          >
            {Object.entries(STORE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-border-light"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // Edit mode: dismiss, store change, remove, mark pantry
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-border-light">
      <span className="flex-1 text-sm text-text">{item.name}</span>
      {qty && (
        <span className="shrink-0 text-xs font-medium text-text-secondary">{qty}</span>
      )}
      {isPinned && (
        <span className="shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">
          weekly
        </span>
      )}

      {/* Store badge — always visible, clickable to change */}
      <div className="relative" ref={storeMenuRef}>
        <button
          onClick={() => setShowStoreMenu(!showStoreMenu)}
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${storeBadgeClasses(item.store)} hover:opacity-80`}
          title="Change store"
        >
          {STORE_LABELS[item.store]}
        </button>
        {showStoreMenu && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface py-1 shadow-warm-lg">
            {(["trader-joes", "target", "whole-foods", "hmart", "other"] as StoreName[]).map(
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

      {/* Actions menu — more visible */}
      <div className="relative" ref={actionsRef}>
        <button
          onClick={() => setShowActions(!showActions)}
          className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-border-light hover:text-text"
          title="Actions"
        >
          <MoreIcon />
        </button>
        {showActions && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-xl border border-border bg-surface py-1 shadow-warm-lg">
            <button
              onClick={() => {
                onStartEdit();
                setShowActions(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-text transition-colors hover:bg-border-light"
            >
              Edit item
            </button>
            {!isPinned && (
              <button
                onClick={() => {
                  onDismiss();
                  setShowActions(false);
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-border-light"
              >
                Have this already
              </button>
            )}
            <button
              onClick={() => {
                onMarkPantry();
                setShowActions(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-border-light"
            >
              Move to pantry staples
            </button>
            {!isPinned ? (
              <button
                onClick={() => {
                  onMoveToWeekly();
                  setShowActions(false);
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs text-primary transition-colors hover:bg-border-light"
              >
                Add as weekly staple
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    onDismiss();
                    setShowActions(false);
                  }}
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-border-light"
                >
                  Skip this week
                </button>
                <button
                  onClick={() => {
                    onRemoveWeekly();
                    setShowActions(false);
                  }}
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs text-text-muted transition-colors hover:bg-border-light"
                >
                  Remove weekly staple
                </button>
              </>
            )}
            <button
              onClick={() => {
                onRemove();
                setShowActions(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-border-light"
            >
              Remove from list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-text-muted">
      <circle cx="4" cy="2" r="1" />
      <circle cx="8" cy="2" r="1" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="8" cy="6" r="1" />
      <circle cx="4" cy="10" r="1" />
      <circle cx="8" cy="10" r="1" />
    </svg>
  );
}

// ── Drag-and-Drop ──

function SortableItemGroup({
  items,
  enabled,
  onReorder,
  children,
}: {
  items: GroceryListItem[];
  enabled: boolean;
  onReorder: (groupItems: GroceryListItem[], activeId: string, overId: string) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(items, active.id as string, over.id as string);
    }
  }

  if (!enabled) {
    return <div className="space-y-1">{children}</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">{children}</div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItemWrapper({
  id,
  enabled,
  children,
}: {
  id: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !enabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      {enabled && (
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none rounded p-1 text-text-muted transition-colors hover:bg-border-light hover:text-text-secondary active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
