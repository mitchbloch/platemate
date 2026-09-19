// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParsedRecipe, RecipeGeneration } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...rest }: React.ComponentProps<"a">) => <a href={href} {...rest}>{children}</a> };
});

import RecipeGenerator from "../RecipeGenerator";

const draft: ParsedRecipe = {
  title: "Lemon Chicken Orzo", description: "Bright and quick.", cuisine: "mediterranean", mealType: "dinner", difficulty: "easy",
  servings: 2, totalTimeMinutes: 30, ingredients: [{ name: "orzo", quantity: 1, unit: "cup", preparation: null, category: "grain", raw: "1 cup orzo" }],
  instructions: ["Boil", "Toss"], nutrition: { calories: 500, protein: 35, carbs: 60, fat: 12, saturatedFat: 3, cholesterol: 90, fiber: 3, sodium: 600 },
  dietaryFlags: [], tags: [], imageUrl: null, isSlowCooker: false, sourceName: "Generated with Platemate",
};
function gen(over: Partial<RecipeGeneration> = {}): RecipeGeneration {
  return { id: "g1", householdId: "h", createdBy: "u", title: "chicken", messages: [], draft: null, status: "active", savedRecipeId: null, createdAt: "", updatedAt: "", ...over };
}
const calls: { url: string; body?: Record<string, unknown> }[] = [];
function mockFetch(handler: (url: string, body?: Record<string, unknown>) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    return handler(url, body);
  }));
}

describe("RecipeGenerator", () => {
  beforeEach(() => {
    calls.length = 0;
    push.mockReset();
    window.history.replaceState(null, "", "/recipes/generate");
  });

  it("sends the first message, starts a chat, and renders options as tappable choices", async () => {
    const user = userEvent.setup();
    const withOptions = gen({ messages: [
      { role: "user", content: "something with chicken", photoCount: 0, seenIngredients: [], at: "" },
      { role: "assistant", reply: "A few directions:", options: [{ title: "Lemon Chicken Orzo", summary: "30 min" }, { title: "Chicken Tikka", summary: "" }], recipe: null, libraryMatches: [], at: "" },
    ] });
    mockFetch(() => new Response(JSON.stringify(withOptions), { status: 200 }));
    render(<RecipeGenerator drafts={[]} initial={null} />);

    await user.type(screen.getByLabelText("Message"), "something with chicken{Enter}");
    expect(await screen.findByText("A few directions:")).toBeInTheDocument();
    expect(calls[0]).toEqual({ url: "/api/generate", body: { generationId: null, message: "something with chicken", images: [] } });
    await waitFor(() => expect(window.location.search).toBe("?g=g1"));

    // Picking an option sends it as the next turn, in the same chat
    mockFetch(() => new Response(JSON.stringify(gen({ messages: [...withOptions.messages, { role: "user", content: "Let's make: Lemon Chicken Orzo", photoCount: 0, seenIngredients: [], at: "" }, { role: "assistant", reply: "Here it is", options: null, recipe: draft, libraryMatches: [], at: "" }], draft })), { status: 200 }));
    await user.click(screen.getByRole("button", { name: /Lemon Chicken Orzo/ }));
    expect(calls.at(-1)!.body).toMatchObject({ generationId: "g1", message: "Let's make: Lemon Chicken Orzo" });
    expect(await screen.findByText("Here it is")).toBeInTheDocument();
    expect(screen.getByText("Current draft: Lemon Chicken Orzo")).toBeInTheDocument();
  });

  it("saves the draft and opens the new recipe", async () => {
    const user = userEvent.setup();
    mockFetch((url) => new Response(JSON.stringify(url.endsWith("/save") ? { id: "r9" } : {}), { status: 201 }));
    render(<RecipeGenerator drafts={[]} initial={gen({ draft, messages: [{ role: "assistant", reply: "Here", options: null, recipe: draft, libraryMatches: [], at: "" }] })} />);
    await user.click(screen.getByRole("button", { name: "Save to my recipes" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes/r9"));
    expect(calls[0].url).toBe("/api/generate/g1/save");
  });

  it("discards a chat and drops it from the drafts strip", async () => {
    const user = userEvent.setup();
    mockFetch(() => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const g = gen({ draft, messages: [{ role: "assistant", reply: "Here", options: null, recipe: draft, libraryMatches: [], at: "" }] });
    render(<RecipeGenerator drafts={[g]} initial={g} />);
    expect(screen.getByRole("button", { name: "chicken" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(calls[0]).toMatchObject({ url: "/api/generate/g1" }));
    expect(screen.queryByRole("button", { name: "chicken" })).toBeNull();
    expect(screen.getByText(/Tell me what you feel like eating/)).toBeInTheDocument();
  });

  it("links library matches to the recipe (with a way back) and adds them to this week's plan", async () => {
    const user = userEvent.setup();
    mockFetch(() => new Response(JSON.stringify({ planId: "p", id: "m" }), { status: 201 }));
    render(<RecipeGenerator drafts={[]} initial={gen({ messages: [{ role: "assistant", reply: "You already have:", options: null, recipe: null, libraryMatches: [{ recipeId: "r1", title: "Chicken Tacos", mealType: "lunch", reason: "uses chicken" }], at: "" }] })} />);
    const link = screen.getByRole("link", { name: "Chicken Tacos" });
    expect(link.getAttribute("href")).toBe("/recipes/r1?from=%2Frecipes%2Fgenerate%3Fg%3Dg1");
    await user.click(screen.getByRole("button", { name: "Add to this week" }));
    await waitFor(() => expect(calls[0].url).toBe("/api/meal-plans/recipes"));
    expect(calls[0].body).toMatchObject({ recipeId: "r1", mealType: "lunch" }); // the recipe's own slot, not a hardcoded one
    expect(String(calls[0].body!.weekStart)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByText("Added to this week's plan")).toBeInTheDocument();
  });

  it("restores the chat if discarding fails", async () => {
    const user = userEvent.setup();
    mockFetch(() => new Response(JSON.stringify({ error: "nope" }), { status: 500 }));
    const g = gen({ draft, messages: [{ role: "assistant", reply: "Here", options: null, recipe: draft, libraryMatches: [], at: "" }] });
    render(<RecipeGenerator drafts={[g]} initial={g} />);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("Couldn't discard that chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "chicken" })).toBeInTheDocument();
    expect(screen.getByText("Here")).toBeInTheDocument();
  });

  it("shows the server's error and keeps the text so you can retry", async () => {
    const user = userEvent.setup();
    mockFetch(() => new Response(JSON.stringify({ error: "The assistant declined that request" }), { status: 422 }));
    render(<RecipeGenerator drafts={[]} initial={null} />);
    await user.type(screen.getByLabelText("Message"), "hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant declined that request");
    expect(screen.getByLabelText("Message")).toHaveValue("hello");
  });

  it("does not clobber the chat you switched to while a send was in flight", async () => {
    const user = userEvent.setup();
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const other = gen({ id: "g2", title: "soup", messages: [{ role: "assistant", reply: "Soup thread", options: null, recipe: null, libraryMatches: [], at: "" }] });
    render(<RecipeGenerator drafts={[other]} initial={null} />);
    await user.type(screen.getByLabelText("Message"), "chicken{Enter}");
    // While waiting, open the other draft
    await user.click(screen.getByRole("button", { name: "soup" }));
    expect(screen.getByText("Soup thread")).toBeInTheDocument();
    // The late answer for the new chat must not replace the soup thread
    release(new Response(JSON.stringify(gen({ id: "g-new", title: "chicken", messages: [{ role: "assistant", reply: "Chicken answer", options: null, recipe: null, libraryMatches: [], at: "" }] })), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "chicken" })).toBeInTheDocument()); // it lands in the drafts strip
    expect(screen.getByText("Soup thread")).toBeInTheDocument();
    expect(screen.queryByText("Chicken answer")).toBeNull();
  });

  it("is read-only once saved", () => {
    render(<RecipeGenerator drafts={[]} initial={gen({ status: "saved", savedRecipeId: "r5", draft, messages: [{ role: "assistant", reply: "Done", options: null, recipe: draft, libraryMatches: [], at: "" }] })} />);
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.getByRole("link", { name: "Open recipe" })).toHaveAttribute("href", "/recipes/r5");
  });
});
