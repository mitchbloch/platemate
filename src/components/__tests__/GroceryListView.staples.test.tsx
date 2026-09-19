// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GroceryList, GroceryListItem, PinnedGroceryItem } from "@/lib/types";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
    },
    removeChannel: () => {},
  }),
}));
vi.mock("@/lib/supabase/realtime", () => ({ subscribeToGroceryList: () => ({ unsubscribe: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import GroceryListView from "../GroceryListView";

const list: GroceryList = { id: "list1", householdId: "h", weekStart: "2026-09-13", mealPlanId: null, status: "edit", completedAt: null, createdAt: "", updatedAt: "" };

function item(id: string, name: string, over: Partial<GroceryListItem> = {}): GroceryListItem {
  return { id, householdId: "h", groceryListId: "list1", name, quantity: null, unit: null, category: "produce", store: "trader-joes", checked: false, dismissed: false, recipeIds: [], isManual: true, sortOrder: 1000, ...over };
}
const yogurtStaple: PinnedGroceryItem = { id: "pin1", householdId: "h", name: "Yogurt", category: "Produce" as never, store: "trader-joes", quantity: null, unit: null, createdAt: "" };
const milkStaple: PinnedGroceryItem = { id: "pin2", householdId: "h", name: "Milk", category: "Dairy" as never, store: "trader-joes", quantity: 1, unit: "gal", createdAt: "" };

const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];

function renderView(items: GroceryListItem[], pinned: PinnedGroceryItem[]) {
  return render(
    <GroceryListView
      initialList={list}
      initialItems={items}
      initialWeekStart="2026-09-13"
      hasMeals={false}
      hasRecipeItems={false}
      initialPantryItems={[]}
      initialPinnedItems={pinned}
      initialFrequentItems={[]}
    />,
  );
}

describe("Weekly staples editor", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url === "/api/pinned-items" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ...yogurtStaple, ...body }), { status: 200 });
      }
      if (url.endsWith("/items") && init?.method === "POST") {
        return new Response(JSON.stringify(item("new1", body.name, { category: "dairy" })), { status: 201 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));
  });

  it("re-tagging a staple's section also moves this week's unchecked copy", async () => {
    const user = userEvent.setup();
    renderView([item("i1", "Yogurt", { category: "produce" })], [yogurtStaple]);

    await user.click(screen.getByRole("button", { name: "Edit staple Yogurt" }));
    const form = screen.getByRole("button", { name: "Save staple" }).closest("form")!;
    await user.selectOptions(within(form).getAllByRole("combobox")[0], "Dairy");
    await user.click(screen.getByRole("button", { name: "Save staple" }));

    await waitFor(() => expect(calls.some((c) => c.url === "/api/pinned-items" && c.method === "PATCH")).toBe(true));
    const staplePatch = calls.find((c) => c.url === "/api/pinned-items" && c.method === "PATCH")!;
    expect(staplePatch.body).toMatchObject({ id: "pin1", name: "Yogurt", category: "Dairy" });

    await waitFor(() => expect(calls.some((c) => c.url === "/api/grocery-lists/list1/items" && c.method === "PATCH")).toBe(true));
    const itemPatch = calls.find((c) => c.url === "/api/grocery-lists/list1/items" && c.method === "PATCH")!;
    expect(itemPatch.body).toMatchObject({ itemId: "i1", category: "Dairy" });
  });

  it("does not touch a copy that is already checked off", async () => {
    const user = userEvent.setup();
    renderView([item("i1", "Yogurt", { checked: true })], [yogurtStaple]);
    await user.click(screen.getByRole("button", { name: "Edit staple Yogurt" }));
    await user.click(screen.getByRole("button", { name: "Save staple" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/pinned-items")).toBe(true));
    expect(calls.some((c) => c.url.includes("/items") && c.method === "PATCH")).toBe(false);
  });

  it("shows skipped staples with a restore action instead of hiding them", async () => {
    const user = userEvent.setup();
    renderView([item("i1", "Yogurt", { dismissed: true })], [yogurtStaple]);
    expect(screen.getByText("skipped this week")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.body.dismissed === false)).toBe(true));
  });

  it("offers to add a staple that is missing from this week's list", async () => {
    const user = userEvent.setup();
    renderView([], [milkStaple]);
    expect(screen.getByText("not on this list")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add this week" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/grocery-lists/list1/items" && c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "Milk", quantity: 1, unit: "gal", category: "Dairy" });
  });

  it("reverts the staple when the server rejects the edit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Invalid category" }), { status: 400 })));
    renderView([item("i1", "Yogurt")], [yogurtStaple]);
    await user.click(screen.getByRole("button", { name: "Edit staple Yogurt" }));
    const nameInput = screen.getByPlaceholderText("Item name...");
    await user.clear(nameInput);
    await user.type(nameInput, "Skyr");
    await user.click(screen.getByRole("button", { name: "Save staple" }));
    await waitFor(() => expect(screen.getByText("Invalid category")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Edit staple Yogurt" })).toBeInTheDocument();
  });
});
