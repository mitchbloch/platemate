// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Recipe } from "@/lib/types";

// Next keeps useSearchParams in sync with native history writes; mirror that
// so any code that re-adopts the URL's query mid-typing is exercised here.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function setUrl(path: string) {
  window.history.replaceState(null, "", path);
}
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...rest }: React.ComponentProps<"a">) => <a href={href} {...rest}>{children}</a> };
});

import RecipeLibrary from "../RecipeLibrary";

function recipe(id: string, title: string, over: Partial<Recipe> = {}): Recipe {
  return {
    id, householdId: "h", title, sourceUrl: null, sourceName: null, description: null,
    cuisine: "american", mealType: "dinner", difficulty: "easy", servings: 2, totalTimeMinutes: null,
    ingredients: [], instructions: [], nutrition: null, dietaryFlags: [], tags: [], imageUrl: null,
    isSlowCooker: false, createdAt: "", updatedAt: "", ...over,
  };
}

const recipes = [
  recipe("1", "Chicken Tacos", { cuisine: "mexican", ingredients: [{ name: "chicken thighs", quantity: 1, unit: "lb", preparation: null, category: "meat", raw: "" }] }),
  recipe("2", "Lentil Soup", { tags: ["vegan"] }),
  recipe("3", "Pad Thai", { cuisine: "asian", ingredients: [{ name: "chicken breast", quantity: 1, unit: "lb", preparation: null, category: "meat", raw: "" }] }),
];

describe("RecipeLibrary", () => {
  beforeEach(() => {
    setUrl("/recipes");
  });

  it("shows every recipe with no query", () => {
    render(<RecipeLibrary recipes={recipes} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("3 recipes")).toBeInTheDocument();
  });

  it("filters by title, ingredient and tag as you type", async () => {
    const user = userEvent.setup();
    render(<RecipeLibrary recipes={recipes} />);
    const box = screen.getByLabelText("Search recipes");

    await user.type(box, "chicken");
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Chicken Tacos"), expect.stringContaining("Pad Thai")]),
    );
    expect(screen.queryByText("Lentil Soup")).toBeNull();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "vegan");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Lentil Soup")).toBeInTheDocument();
  });

  it("offers a clear action when nothing matches", async () => {
    const user = userEvent.setup();
    render(<RecipeLibrary recipes={recipes} />);
    await user.type(screen.getByLabelText("Search recipes"), "pizza");
    expect(screen.getByText(/No recipes match/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all recipes" }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("mirrors the query into the URL (debounced) without a router navigation", async () => {
    const user = userEvent.setup();
    render(<RecipeLibrary recipes={recipes} />);
    await user.type(screen.getByLabelText("Search recipes"), "taco");
    await waitFor(() => expect(window.location.search).toBe("?q=taco"));
    await user.clear(screen.getByLabelText("Search recipes"));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("never overwrites characters typed while the URL write lands (fast typing)", async () => {
    // Regression: the URL mirror used to echo an older query back into the
    // input, deleting keystrokes typed after the debounce fired.
    const user = userEvent.setup();
    const { rerender } = render(<RecipeLibrary recipes={recipes} />);
    const box = screen.getByLabelText("Search recipes");
    await user.type(box, "tac");
    await waitFor(() => expect(window.location.search).toBe("?q=tac"));
    await user.type(box, "os");
    rerender(<RecipeLibrary recipes={recipes} />); // router re-render with the older ?q=tac still in the URL
    expect(box).toHaveValue("tacos");
    await waitFor(() => expect(window.location.search).toBe("?q=tacos"));
    expect(box).toHaveValue("tacos");
  });

  it("adopts the URL's query only on browser back/forward", async () => {
    render(<RecipeLibrary recipes={recipes} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    setUrl("/recipes?q=taco");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(screen.getByLabelText("Search recipes")).toHaveValue("taco"));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    setUrl("/recipes");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(screen.getByLabelText("Search recipes")).toHaveValue(""));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("starts from the query in the URL", () => {
    setUrl("/recipes?q=lentil");
    render(<RecipeLibrary recipes={recipes} />);
    expect(screen.getByLabelText("Search recipes")).toHaveValue("lentil");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
