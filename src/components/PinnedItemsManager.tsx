"use client";

import { useState } from "react";
import type {
  GroceryDisplayCategory,
  PinnedGroceryItem,
  StoreName,
  IngredientCategory,
} from "@/lib/types";
import { STORE_LABELS } from "@/lib/types";
import { GROCERY_CATEGORY_LABELS } from "@/lib/categoryMap";

interface PinnedItemsManagerProps {
  initialPinned: PinnedGroceryItem[];
  initialFrequent: { name: string; count: number; category: IngredientCategory; store: StoreName }[];
  onPinnedChange?: () => void;
}

export default function PinnedItemsManager({
  initialPinned,
  initialFrequent,
  onPinnedChange,
}: PinnedItemsManagerProps) {
  const [pinned, setPinned] = useState<PinnedGroceryItem[]>(initialPinned);
  const [frequent, setFrequent] = useState(initialFrequent);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<GroceryDisplayCategory>("other");
  const [newStore, setNewStore] = useState<StoreName>("trader-joes");

  async function addPinned(
    name: string,
    category: GroceryDisplayCategory = "other",
    store: StoreName = "trader-joes",
  ) {
    try {
      const res = await fetch("/api/pinned-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, store }),
      });
      if (!res.ok) throw new Error("Failed to add");
      const item = await res.json();
      setPinned((prev) => [...prev, item]);
      setFrequent((prev) => prev.filter((f) => f.name.toLowerCase() !== name.toLowerCase()));
      onPinnedChange?.();
    } catch {
      alert("Failed to pin item");
    }
  }

  async function removePinned(id: string) {
    const removed = pinned.find((p) => p.id === id);
    setPinned((prev) => prev.filter((p) => p.id !== id));

    try {
      const res = await fetch("/api/pinned-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      onPinnedChange?.();
    } catch {
      if (removed) setPinned((prev) => [...prev, removed]);
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await addPinned(newName.trim(), newCategory, newStore);
    setNewName("");
    setShowAddForm(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h2 className="mb-3 text-sm font-medium text-gray-900">
        Pinned Staples
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        These items auto-appear on every grocery list.
      </p>

      {/* Pinned items list */}
      {pinned.length === 0 ? (
        <p className="mb-3 text-xs text-gray-400">No pinned items yet.</p>
      ) : (
        <div className="mb-3 space-y-1">
          {pinned.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              <span className="text-sm text-gray-700">{item.name}</span>
              <div className="flex items-center gap-2">
                {item.store !== "trader-joes" && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    {STORE_LABELS[item.store]}
                  </span>
                )}
                <button
                  onClick={() => removePinned(item.id)}
                  className="text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAddForm ? (
        <form onSubmit={handleAddSubmit} className="space-y-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as GroceryDisplayCategory)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Object.entries(GROCERY_CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={newStore}
              onChange={(e) => setNewStore(e.target.value as StoreName)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Object.entries(STORE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Pin
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full rounded-lg border border-dashed border-gray-200 py-1.5 text-xs text-gray-400 hover:border-primary hover:text-primary"
        >
          + Add pinned item
        </button>
      )}

      {/* Frequent item suggestions */}
      {frequent.length > 0 && (
        <div className="mt-4 rounded-lg bg-primary/5 p-3">
          <h3 className="mb-1.5 text-xs font-medium text-primary">
            Frequently bought
          </h3>
          <p className="mb-2 text-xs text-gray-500">
            These appeared in 3+ recent lists. Pin them?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {frequent.map((item) => (
              <button
                key={item.name}
                onClick={() => addPinned(item.name, "other", item.store)}
                className="rounded-full border border-primary/20 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-primary hover:bg-primary/5"
              >
                {item.name}
                <span className="ml-1 text-gray-400">({item.count}x)</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
