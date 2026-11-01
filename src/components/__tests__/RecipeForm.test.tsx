// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParsedRecipe } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const downscaled = vi.hoisted(() => ({ maxEdges: [] as (number | undefined)[] }));
vi.mock("@/lib/imageDownscale", () => ({
  SCREENSHOT_MAX_EDGE_PX: 1568,
  downscaleToJpegBase64: async (file: File, maxEdge?: number) => {
    downscaled.maxEdges.push(maxEdge);
    return btoa(file.name);
  },
}));

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
  downscaled.maxEdges = [];
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

  it("saves the clean canonical link the server returns, not the pasted one (regression)", async () => {
    const canonical = "https://www.tiktok.com/@panaceapalm/video/7641621946563661078";
    responses["/api/recipes/parse"] = () => json({ ...parsed, sourceUrl: canonical });
    responses["/api/recipes"] = () => json({ id: "r1" });
    const user = await importUrl("https://www.tiktok.com/t/ZPLPoL8uG/?_r=1&_t=ZP-9B");
    await user.click(await screen.findByRole("button", { name: "Save Recipe" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes/r1"));
    expect(calls[1].body.sourceUrl).toBe(canonical);
    expect(calls[1].body.title).toBe("Sheetpan Chicken Kebabs");
  });

  it("on a blocked site, switches to Paste Text, keeps the cleaned link and explains why", async () => {
    responses["/api/recipes/parse"] = () =>
      json(
        { error: "This site doesn't allow automatic import.", reason: "blocked", canPaste: true, sourceUrl: "https://www.budgetbytes.com/x/" },
        422,
      );
    await importUrl("https://www.budgetbytes.com/x/?utm_source=pinterest");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "This site doesn't allow automatic import. Paste the recipe text or add screenshots below instead.",
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
      body: { text: "1kg lean ground chicken", images: [], sourceUrl: "https://www.instagram.com/reel/x/" },
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

const png = (name: string) => new File(["x"], name, { type: "image/png" });

async function openPasteText() {
  const user = userEvent.setup();
  render(<RecipeForm />);
  await user.click(screen.getByRole("button", { name: "Or paste recipe text instead" }));
  return user;
}

describe("RecipeForm — screenshots", () => {
  it("imports from screenshots alone, downscaled for legible text", async () => {
    responses["/api/recipes/parse-text"] = () => json(parsed);
    const user = await openPasteText();
    await user.upload(screen.getByLabelText(/Add screenshots/), [png("caption.png"), png("comments.png")]);

    expect(await screen.findByAltText("Attached screenshot 2")).toBeInTheDocument();
    expect(screen.getByText(/Add screenshots \(2\/5\)/)).toBeInTheDocument();
    expect(downscaled.maxEdges).toEqual([1568, 1568]);

    await user.click(screen.getByRole("button", { name: "Import Recipe" }));
    expect(await screen.findByDisplayValue("Sheetpan Chicken Kebabs")).toBeInTheDocument();
    expect(calls[0]).toEqual({ url: "/api/recipes/parse-text", body: { text: "", images: [btoa("caption.png"), btoa("comments.png")] } });
  });

  it("removes a screenshot before import", async () => {
    responses["/api/recipes/parse-text"] = () => json(parsed);
    const user = await openPasteText();
    await user.upload(screen.getByLabelText(/Add screenshots/), [png("a.png"), png("b.png")]);
    await user.click(await screen.findByRole("button", { name: "Remove screenshot 1" }));
    await user.type(screen.getByLabelText("Recipe Text"), "serves 4");
    await user.click(screen.getByRole("button", { name: "Import Recipe" }));
    await screen.findByDisplayValue("Sheetpan Chicken Kebabs");
    expect(calls[0].body).toEqual({ text: "serves 4", images: [btoa("b.png")] });
  });

  it("caps at 5 screenshots and says so", async () => {
    const user = await openPasteText();
    await user.upload(screen.getByLabelText(/Add screenshots/), ["1", "2", "3", "4", "5", "6"].map((n) => png(`${n}.png`)));
    expect(await screen.findByRole("alert")).toHaveTextContent("Up to 5 screenshots");
    expect(screen.getAllByAltText(/Attached screenshot/)).toHaveLength(5);
    expect(screen.getByLabelText(/Add screenshots/)).toBeDisabled();
  });

  it("asks for text or a screenshot instead of submitting nothing", async () => {
    const user = await openPasteText();
    await user.click(screen.getByRole("button", { name: "Import Recipe" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Paste the recipe text or add a screenshot.");
    expect(calls).toEqual([]);
  });

  it("keeps attached screenshots after a no-recipe answer so the user can add more", async () => {
    responses["/api/recipes/parse-text"] = () =>
      json({ error: "Couldn't find a full recipe there (it may be behind a paywall).", reason: "no_recipe", canPaste: true, sourceUrl: null }, 422);
    const user = await openPasteText();
    await user.upload(screen.getByLabelText(/Add screenshots/), [png("teaser.png")]);
    await user.click(screen.getByRole("button", { name: "Import Recipe" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't find a full recipe there");
    expect(screen.getByAltText("Attached screenshot 1")).toBeInTheDocument();
  });
});
