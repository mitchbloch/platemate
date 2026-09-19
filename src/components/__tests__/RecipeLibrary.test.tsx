// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Recipe } from "@/lib/types";

const nav = { replace: vi.fn(), params: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/recipes",
  useSearchParams: () => nav.params,
}));
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
    nav.replace.mockReset();
    nav.params = new URLSearchParams();
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

  it("mirrors the query into the URL (debounced) so back-navigation keeps it", async () => {
    const user = userEvent.setup();
    render(<RecipeLibrary recipes={recipes} />);
    await user.type(screen.getByLabelText("Search recipes"), "taco");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/recipes?q=taco", { scroll: false }));
  });

  it("adopts the URL's query when the browser navigates back or forward", () => {
    const { rerender } = render(<RecipeLibrary recipes={recipes} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    nav.params = new URLSearchParams("q=taco");
    rerender(<RecipeLibrary recipes={recipes} />);
    expect(screen.getByLabelText("Search recipes")).toHaveValue("taco");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    nav.params = new URLSearchParams();
    rerender(<RecipeLibrary recipes={recipes} />);
    expect(screen.getByLabelText("Search recipes")).toHaveValue("");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("starts from the query in the URL", () => {
    nav.params = new URLSearchParams("q=lentil");
    render(<RecipeLibrary recipes={recipes} />);
    expect(screen.getByLabelText("Search recipes")).toHaveValue("lentil");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
