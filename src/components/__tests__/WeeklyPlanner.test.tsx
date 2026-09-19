// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Recipe } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...rest }: React.ComponentProps<"a">) => <a href={href} {...rest}>{children}</a> };
});

import WeeklyPlanner from "../WeeklyPlanner";

function recipe(id: string, title: string, over: Partial<Recipe> = {}): Recipe {
  return {
    id, householdId: "h", title, sourceUrl: null, sourceName: null, description: null,
    cuisine: "american", mealType: "dinner", difficulty: "easy", servings: 2, totalTimeMinutes: null,
    ingredients: [], instructions: [], nutrition: null, dietaryFlags: [], tags: [], imageUrl: null,
    isSlowCooker: false, createdAt: "", updatedAt: "", ...over,
  };
}
const recipes = [recipe("r1", "Chicken Tacos", { cuisine: "mexican" }), recipe("r2", "Lentil Soup")];

function renderPlanner() {
  return render(
    <WeeklyPlanner initialRecipes={recipes} initialPlan={null} initialMeals={[]} initialWeekStart="2026-09-13" lastCookedDates={{}} />,
  );
}

describe("WeeklyPlanner picker", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/plan");
  });

  it("links each picker row to the recipe, carrying the way back to this picker state", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Pick some meals for the week" }));
    await user.type(screen.getByLabelText("Search recipes"), "taco");
    await user.selectOptions(screen.getByLabelText("Filter by cuisine"), "mexican");

    const link = screen.getByRole("link", { name: /Chicken Tacos/ });
    const href = new URL(link.getAttribute("href")!, "http://x");
    expect(href.pathname).toBe("/recipes/r1");
    expect(href.searchParams.get("from")).toBe("/plan?add=1&q=taco&cuisine=mexican");
  });

  it("mirrors the open picker, query and filters into the URL", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Pick some meals for the week" }));
    await user.type(screen.getByLabelText("Search recipes"), "lentil");
    await waitFor(() => expect(window.location.search).toBe("?add=1&q=lentil"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("reopens the picker with its state when arriving via that URL (back from a recipe)", () => {
    window.history.replaceState(null, "", "/plan?add=1&q=lentil&type=dinner");
    renderPlanner();
    expect(screen.getByLabelText("Search recipes")).toHaveValue("lentil");
    expect(screen.getByLabelText("Filter by meal type")).toHaveValue("dinner");
    expect(screen.getByRole("link", { name: /Lentil Soup/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chicken Tacos/ })).toBeNull();
  });

  it("ignores junk filter values in the URL", () => {
    window.history.replaceState(null, "", "/plan?add=1&cuisine=martian");
    renderPlanner();
    expect(screen.getByLabelText("Filter by cuisine")).toHaveValue("all");
  });
});
