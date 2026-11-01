import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { extractImportSource } from "..";
import { createDeadline, ImportFailure } from "../fetchPage";
import {
  TIKTOK_VTT_URL,
  cloudflareChallenge,
  htmlResponse,
  jsonResponse,
  pinPage,
  redirectResponse,
  siteRecipePage,
  stubFetch,
  textResponse,
  tiktokPage,
  tiktokVtt,
} from "./fixtures";

const PIN = "https://www.pinterest.com/pin/115334440443527182/";
const RECIPE = "https://www.example.com/recipes/lentil-soup/?utm_source=pinterest";
const REEL = "https://www.instagram.com/reel/DCt9t_QSvOc/?igsh=abc";
const TIKTOK = "https://www.tiktok.com/@panaceapalm/video/7641621946563661078";
const braveUrl = (q: string) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`;

async function failure(promise: Promise<unknown>): Promise<ImportFailure> {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImportFailure);
  return err as ImportFailure;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("extractImportSource — Pinterest", () => {
  it("follows the pin to the recipe it links to (pin.it short link)", async () => {
    const calls = stubFetch({
      "https://pin.it/abc123": () => redirectResponse(PIN),
      [PIN]: () => htmlResponse(pinPage()),
      [RECIPE]: () => htmlResponse(siteRecipePage()),
    });
    const source = await extractImportSource("https://pin.it/abc123", createDeadline(5_000));
    expect(source.sections[0].label).toBe("STRUCTURED DATA");
    expect(source.sourceUrl).toBe("https://www.example.com/recipes/lentil-soup/");
    expect(source.sourceName).toBe("Example Kitchen");
    expect(calls).not.toContain("https://unrelated.example/other-pin");
  });

  it("follows a pin that links to a TikTok", async () => {
    stubFetch({
      [PIN]: () => htmlResponse(pinPage({ outbound: TIKTOK })),
      [TIKTOK]: () => htmlResponse(tiktokPage()),
      [TIKTOK_VTT_URL]: () => textResponse(tiktokVtt, "video/mp4"),
    });
    expect((await extractImportSource(PIN, createDeadline(5_000))).sourceName).toBe("TikTok — Panacea Palm");
  });

  it("uses the pin's own description when the linked site blocks us and the description is a recipe", async () => {
    const body = "Lentil soup. Ingredients: 1 cup lentils, 4 cups stock, 1 onion, 2 carrots. Method: sauté the onion and carrots, add lentils and stock, simmer 30 minutes, season with salt and pepper and serve with chopped parsley and a squeeze of lemon.";
    stubFetch({ [PIN]: () => htmlResponse(pinPage({ articleBody: body })), [RECIPE]: () => htmlResponse(cloudflareChallenge, 403) });
    const source = await extractImportSource(PIN, createDeadline(5_000));
    expect(source.sections).toEqual([{ label: "CAPTION", text: body }]);
    expect(source.sourceName).toBe("Pinterest — Jenn Fishkind");
  });

  it("reports the linked site's failure when the pin description is too thin", async () => {
    stubFetch({ [PIN]: () => htmlResponse(pinPage()), [RECIPE]: () => htmlResponse(cloudflareChallenge, 403) });
    expect((await failure(extractImportSource(PIN, createDeadline(5_000)))).reason).toBe("blocked");
  });

  it("reports no_recipe for a pin with no link and a thin description", async () => {
    stubFetch({ [PIN]: () => htmlResponse(pinPage({ outbound: null })) });
    expect((await failure(extractImportSource(PIN, createDeadline(5_000)))).reason).toBe("no_recipe");
  });

  it("never follows a pin to another pin (one hop only)", async () => {
    const other = "https://www.pinterest.com/pin/999/";
    const calls = stubFetch({ [PIN]: () => htmlResponse(pinPage({ outbound: other })) });
    await failure(extractImportSource(PIN, createDeadline(5_000)));
    expect(calls).toEqual([PIN]);
  });
});

describe("extractImportSource — Instagram", () => {
  beforeEach(() => vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-key"));

  it("imports the same video cross-posted to TikTok", async () => {
    stubFetch({
      [braveUrl(REEL)]: () => jsonResponse({ web: { results: [{ url: "https://www.instagram.com/p/x/" }, { url: TIKTOK }] } }),
      [TIKTOK]: () => htmlResponse(tiktokPage()),
      [TIKTOK_VTT_URL]: () => textResponse(tiktokVtt, "video/mp4"),
    });
    const source = await extractImportSource(REEL, createDeadline(5_000));
    expect(source.sourceName).toBe("TikTok — Panacea Palm");
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION", "TRANSCRIPT"]);
  });

  it("reports blocked when no cross-post exists (user pastes or screenshots)", async () => {
    stubFetch({ [braveUrl(REEL)]: () => jsonResponse({ web: { results: [{ url: "https://www.instagram.com/p/x/" }] } }) });
    expect((await failure(extractImportSource(REEL, createDeadline(5_000)))).reason).toBe("blocked");
  });

  it("never fetches Instagram itself, and skips search without an API key", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    const calls = stubFetch({});
    expect((await failure(extractImportSource(REEL, createDeadline(5_000)))).reason).toBe("blocked");
    expect(calls).toEqual([]);
  });

  it("treats a search API error as no cross-post", async () => {
    stubFetch({ [braveUrl(REEL)]: () => htmlResponse("rate limited", 429) });
    expect((await failure(extractImportSource(REEL, createDeadline(5_000)))).reason).toBe("blocked");
  });
});
