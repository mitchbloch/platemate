// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...rest }: React.ComponentProps<"a">) => <a href={href} {...rest}>{children}</a> };
});

import SaveSharedRecipe from "../SaveSharedRecipe";

describe("SaveSharedRecipe", () => {
  beforeEach(() => push.mockReset());

  it("sends signed-out visitors to sign in or sign up, and brings them back to the link", () => {
    render(<SaveSharedRecipe token="tok123" viewer={null} />);
    expect(screen.getByRole("link", { name: "Sign in to save" })).toHaveAttribute("href", "/login?next=%2Fr%2Ftok123");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Fr%2Ftok123");
  });

  it("saves a copy and opens it", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "new1" }), { status: 201 })));
    render(<SaveSharedRecipe token="tok123" viewer={{ ownedRecipeId: null }} />);
    await user.click(screen.getByRole("button", { name: "Save to my recipes" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes/new1"));
    expect(fetch).toHaveBeenCalledWith("/api/share/tok123/save", { method: "POST" });
  });

  it("points at the existing copy instead of duplicating", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Already in your library", recipeId: "mine" }), { status: 409 })));
    render(<SaveSharedRecipe token="tok123" viewer={{ ownedRecipeId: null }} />);
    await user.click(screen.getByRole("button", { name: "Save to my recipes" }));
    expect(await screen.findByText("Already in your library.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/recipes/mine");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the server's error and lets you retry", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "This link is no longer active" }), { status: 404 })));
    render(<SaveSharedRecipe token="tok123" viewer={{ ownedRecipeId: null }} />);
    await user.click(screen.getByRole("button", { name: "Save to my recipes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is no longer active");
    expect(screen.getByRole("button", { name: "Save to my recipes" })).toBeEnabled();
  });

  it("knows when the viewer already owns the recipe", () => {
    render(<SaveSharedRecipe token="tok123" viewer={{ ownedRecipeId: "r9" }} />);
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/recipes/r9");
  });
});
