// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Recipe } from "@/lib/types";
import ShareRecipeButton from "../ShareRecipeButton";

const recipe: Recipe = {
  id: "r1", householdId: "h", title: "Shrimp Tacos", sourceUrl: null, sourceName: null, description: null,
  cuisine: "mexican", mealType: "dinner", difficulty: "easy", servings: 4, totalTimeMinutes: 25,
  ingredients: [{ name: "shrimp", quantity: 1, unit: "lb", preparation: null, category: "seafood", raw: "1 lb shrimp" }],
  instructions: ["Cook"], nutrition: null, dietaryFlags: [], tags: [], imageUrl: null, isSlowCooker: false, createdAt: "", updatedAt: "",
};
const share = { id: "s1", recipeId: "r1", token: "tok", viewCount: 3, saveCount: 1, revokedAt: null, createdAt: "" };
const url = `${window.location.origin}/r/tok`;

// user-event installs its own clipboard stub in setup(); read back through it.
describe("ShareRecipeButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { share?: unknown }).share;
  });

  it("creates the link on first share and hands it to the native share sheet", async () => {
    const user = userEvent.setup();
    const nativeShare = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: nativeShare, configurable: true, writable: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(share), { status: 200 })));

    render(<ShareRecipeButton recipe={recipe} initialShare={null} />);
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(nativeShare).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/recipes/r1/share", { method: "POST" });
    expect(nativeShare).toHaveBeenCalledWith({ title: "Shrimp Tacos", text: "Shrimp Tacos — a recipe from Platemate", url });
    expect(await screen.findByText(/Shared · 3 views · 1 saved/)).toBeInTheDocument();
  });

  it("copies the link when there is no share sheet", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(share), { status: 200 })));
    render(<ShareRecipeButton recipe={recipe} initialShare={null} />);
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(url);
  });

  it("copies the recipe as text, including the link when one exists", async () => {
    const user = userEvent.setup();
    render(<ShareRecipeButton recipe={recipe} initialShare={share} />);
    await user.click(screen.getByRole("button", { name: "More share options" }));
    await user.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(await screen.findByText("Recipe copied as text")).toBeInTheDocument();
    const text = await navigator.clipboard.readText();
    expect(text.startsWith("Shrimp Tacos\n")).toBe(true);
    expect(text).toContain(`Shared from Platemate: ${url}`);
  });

  it("stops sharing and reverts if the server refuses", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    render(<ShareRecipeButton recipe={recipe} initialShare={share} />);
    await user.click(screen.getByRole("button", { name: "More share options" }));
    await user.click(screen.getByRole("button", { name: "Stop sharing" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/recipes/r1/share", { method: "DELETE" }));
    expect(await screen.findByText("Link disabled")).toBeInTheDocument();
    expect(screen.queryByText(/Shared · 3 views/)).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 })));
    const { unmount } = render(<ShareRecipeButton recipe={recipe} initialShare={share} />);
    await user.click(screen.getAllByRole("button", { name: "More share options" }).at(-1)!);
    await user.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(await screen.findByText("Couldn't stop sharing")).toBeInTheDocument();
    expect(screen.getByText(/Shared · 3 views · 1 saved/)).toBeInTheDocument();
    unmount();
  });
});
