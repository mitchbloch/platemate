import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { extractImportSource } from "..";
import { createDeadline, ImportFailure } from "../fetchPage";
import { blogPostPage, cloudflareChallenge, htmlResponse, siteRecipePage, stubFetch } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const deadline = () => createDeadline(5_000);

async function failure(promise: Promise<unknown>): Promise<ImportFailure> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImportFailure);
  return err as ImportFailure;
}

describe("extractImportSource — web", () => {
  const URL_ = "https://www.example.com/recipes/lentil-soup/?utm_source=pinterest";

  it("sends the Recipe JSON-LD as structured data with site name, image and clean URL", async () => {
    stubFetch({ [URL_]: () => htmlResponse(siteRecipePage()) });
    const source = await extractImportSource(URL_, deadline());
    expect(source.sections).toHaveLength(1);
    expect(source.sections[0].label).toBe("STRUCTURED DATA");
    expect(JSON.parse(source.sections[0].text)).toMatchObject({
      name: "Lentil Soup",
      recipeIngredient: ["1 cup brown lentils", "4 cups vegetable stock", "Fresh parsley, to serve"],
      nutrition: { calories: "260 kcal" },
    });
    expect(source).toMatchObject({
      sourceName: "Example Kitchen",
      imageUrl: "https://cdn.example.com/lentil-1x1.jpg",
      sourceUrl: "https://www.example.com/recipes/lentil-soup/",
      expectedIngredientCount: 3,
      images: [],
    });
  });

  it("keeps every ingredient on very long pages (regression: 60k HTML cut dropped the last ones)", async () => {
    stubFetch({ [URL_]: () => htmlResponse(siteRecipePage({ filler: 5_000 })) });
    const source = await extractImportSource(URL_, deadline());
    expect(source.sections[0].text).toContain("Fresh parsley, to serve");
  });

  it("falls back to page text (not HTML) when there is no Recipe JSON-LD", async () => {
    const url = "https://stealthhealthlife.substack.com/p/chili";
    stubFetch({ [url]: () => htmlResponse(blogPostPage) });
    const source = await extractImportSource(url, deadline());
    expect(source.sections[0].label).toBe("PAGE TEXT");
    expect(source.sections[0].text).toContain("- 1 lb 93% lean ground turkey");
    expect(source.sections[0].text).not.toContain("<");
    expect(source.sections[0].text).not.toContain("Subscribe"); // header chrome dropped
    expect(source.sourceName).toBe("Stealth Health Life");
    expect(source.expectedIngredientCount).toBeUndefined();
  });

  it("reports a near-empty page as no_recipe", async () => {
    const url = "https://empty.example.com/";
    stubFetch({ [url]: () => htmlResponse("<html><body><p>Hi</p></body></html>") });
    expect((await failure(extractImportSource(url, deadline()))).reason).toBe("no_recipe");
  });

  it("reports a bot challenge as blocked without retrying", async () => {
    const url = "https://www.budgetbytes.com/x/";
    const calls = stubFetch({ [url]: () => htmlResponse(cloudflareChallenge, 403) });
    expect((await failure(extractImportSource(url, deadline()))).reason).toBe("blocked");
    expect(calls).toEqual([url]);
  });

  it("reports a publisher block (402) as blocked", async () => {
    const url = "https://www.allrecipes.com/recipe/1/";
    stubFetch({ [url]: () => htmlResponse("<p>contentlicensing@people.inc</p>", 402) });
    expect((await failure(extractImportSource(url, deadline()))).reason).toBe("blocked");
  });
});
