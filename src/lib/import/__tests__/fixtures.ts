/** Synthetic pages modeled on real page shapes captured 2026-11-01 during
 *  the Phase 9 audit (tasks/phase9_recipe_import.md). They reproduce the
 *  structure extraction depends on, not the sites' content. */
import { vi } from "vitest";

type Route = (init: RequestInit) => Response | Promise<Response>;

/** Stub global fetch with a URL → response table; records every call */
export function stubFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit = {}) => {
    const url = input.toString();
    calls.push(url);
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: no route for ${url}`);
    return route(init);
  });
  return calls;
}

export const htmlResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
export const textResponse = (body: string, contentType = "text/plain") =>
  new Response(body, { status: 200, headers: { "content-type": contentType } });
export const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
export const redirectResponse = (location: string) => new Response(null, { status: 301, headers: { location } });
/** Never resolves until aborted — simulates a hung endpoint */
export const hangingResponse: Route = (init) =>
  new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));

// ── Recipe site (WP Recipe Maker / Yoast @graph shape) ──

export const siteRecipePage = (opts: { filler?: number } = {}) => `<!doctype html><html><head>
<title>Lentil Soup | Example Kitchen</title>
<meta property="og:site_name" content="Example Kitchen">
<meta property="og:image" content="/og/lentil.jpg">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", name: "Lentil Soup" },
    {
      "@type": "Recipe",
      name: "Lentil Soup",
      image: ["https://cdn.example.com/lentil-1x1.jpg"],
      recipeYield: ["4", "4 servings"],
      totalTime: "PT45M",
      recipeIngredient: ["1 cup brown lentils", "4 cups vegetable stock", "Fresh parsley, to serve"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Simmer everything 30 minutes." }],
      nutrition: { "@type": "NutritionInformation", calories: "260 kcal", cholesterolContent: "0 mg" },
    },
  ],
})}</script></head><body>${"<p>Long personal story about soup. </p>".repeat(opts.filler ?? 10)}
<div class="wprm-recipe"><h2>Lentil Soup</h2><ul><li>1 cup brown lentils</li></ul></div></body></html>`;

// Substack post: no JSON-LD Recipe, the recipe is in the body text
export const blogPostPage = `<!doctype html><html><head><title>High Protein Chili</title>
<meta property="og:site_name" content="Stealth Health Life"></head><body>
<header>Subscribe</header><div class="available-content"><h1>High Protein Chili</h1>
<p>${"This chili packs 50g of protein per bowl. ".repeat(6)}</p>
<h3>Ingredients</h3><ul><li>1 lb 93% lean ground turkey</li><li>1 can kidney beans</li></ul>
<h3>Instructions</h3><ol><li>Brown the turkey.</li><li>Add beans and simmer 20 minutes.</li></ol></div></body></html>`;

export const cloudflareChallenge = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head>
<body><script>window._cf_chl_opt={cvId: '3',cType: 'managed'};</script></body></html>`;
