// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParsedRecipe } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import RecipeForm from "../RecipeForm";

const parsed: ParsedRecipe = {
  title: "Sheetpan Chicken Kebabs",
  description: null,
  cuisine: "middle-eastern",
  mealType: "dinner",
  difficulty: "easy",
  servings: 4,
  totalTimeMinutes: 40,
  ingredients: [{ name: "ground chicken", quantity: 1, unit: "kg", preparation: null, category: "meat", raw: "1kg lean ground chicken", shoppingName: "ground chicken" }],
  instructions: ["Bake."],
  nutrition: { calories: 586, protein: 62, carbs: 45, fat: 16, saturatedFat: 4, cholesterol: 150, fiber: 5, sodium: 900 },
  dietaryFlags: [],
  tags: [],
  imageUrl: null,
  isSlowCooker: false,
  sourceName: "TikTok — Panacea Palm",
};

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[];
let responses: Record<string, () => Response>;

beforeEach(() => {
  calls = [];
  responses = {};
  push.mockReset();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return responses[url]();
  });
});
afterEach(() => vi.unstubAllGlobals());

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function importUrl(url: string) {
  const user = userEvent.setup();
  render(<RecipeForm />);
  await user.type(screen.getByLabelText("Recipe URL"), url);
  await user.click(screen.getByRole("button", { name: "Import Recipe" }));
  return user;
}

describe("RecipeForm — URL import", () => {
  it("shows the review step on success", async () => {
    responses["/api/recipes/parse"] = () => json(parsed);
    await importUrl("https://www.tiktok.com/t/ZPLPoL8uG/");
    expect(await screen.findByDisplayValue("Sheetpan Chicken Kebabs")).toBeInTheDocument();
    expect(calls[0]).toEqual({ url: "/api/recipes/parse", body: { url: "https://www.tiktok.com/t/ZPLPoL8uG/" } });
  });

  it("on a blocked site, switches to Paste Text, keeps the cleaned link and explains why", async () => {
    responses["/api/recipes/parse"] = () =>
      json(
        { error: "This site doesn't allow automatic import.", reason: "blocked", canPaste: true, sourceUrl: "https://www.budgetbytes.com/x/" },
        422,
      );
    await importUrl("https://www.budgetbytes.com/x/?utm_source=pinterest");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "This site doesn't allow automatic import. Paste the recipe text below instead.",
    );
    expect(screen.getByLabelText("Recipe Text")).toBeInTheDocument();
    expect(screen.getByLabelText(/Source URL/)).toHaveValue("https://www.budgetbytes.com/x/");
  });

  it("saves the pasted fallback with the kept link as its source", async () => {
    responses["/api/recipes/parse"] = () =>
      json({ error: "This post is private or needs a login.", reason: "login_required", canPaste: true, sourceUrl: "https://www.instagram.com/reel/x/" }, 422);
    responses["/api/recipes/parse-text"] = () => json(parsed);
    responses["/api/recipes"] = () => json({ id: "r1" });
    const user = await importUrl("https://www.instagram.com/reel/x/?igsh=abc");

    await user.type(await screen.findByLabelText("Recipe Text"), "1kg lean ground chicken");
    await user.click(screen.getByRole("button", { name: "Import Recipe" }));
    expect(calls[1]).toEqual({
      url: "/api/recipes/parse-text",
      body: { text: "1kg lean ground chicken", sourceUrl: "https://www.instagram.com/reel/x/" },
    });

    await user.click(await screen.findByRole("button", { name: "Save Recipe" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes/r1"));
    expect(calls[2].body.sourceUrl).toBe("https://www.instagram.com/reel/x/");
  });

  it("shows unexpected server errors without switching modes", async () => {
    responses["/api/recipes/parse"] = () => json({ error: "Claude declined to process this content" }, 500);
    await importUrl("https://example.com/r");
    expect(await screen.findByRole("status")).toHaveTextContent("Claude declined to process this content");
    expect(screen.getByLabelText("Recipe URL")).toBeInTheDocument();
  });
});
