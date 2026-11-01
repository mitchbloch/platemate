import { absoluteHttpUrl, creditedSourceName, detectSource, stripTracking } from "./platforms";
import { fetchPage, subDeadline, type Deadline } from "./fetchPage";
import { ImportFailure } from "./failure";
import { extractRecipeJsonLd, extractSocialPosting } from "./jsonLd";
import { extractMeta, htmlToText } from "./text";
import { extractTikTok } from "./tiktok";
import { extractYouTube } from "./youtube";

export type SectionLabel = "STRUCTURED DATA" | "PAGE TEXT" | "CAPTION" | "TRANSCRIPT" | "USER TEXT";

/** Everything extracted from a source, ready for the single Claude call */
export interface ImportSource {
  sections: { label: SectionLabel; text: string }[];
  /** Base64 JPEG screenshots/photos (no data: prefix) */
  images: string[];
  /** Set when extraction knows it ("TikTok — Panacea Palm"); else Claude infers */
  sourceName: string | null;
  /** Stable image URL, or null. Claude never supplies this. */
  imageUrl: string | null;
  /** Clean URL to save with the recipe (tracking params removed) */
  sourceUrl: string | null;
  /** Ingredient count in structured data, for a completeness warning */
  expectedIngredientCount?: number;
}

/** One budget per import, inside the route's 60s maxDuration (decision 9).
 *  Extraction gets at most EXTRACT_BUDGET_MS so Claude always has time. */
export const IMPORT_BUDGET_MS = 57_000;
export const EXTRACT_BUDGET_MS = 15_000;

/** Visible page text sent when a site has no Recipe JSON-LD. Text, not
 *  HTML, so 60k covers far more of the page than the old HTML cut did. */
const PAGE_TEXT_LIMIT = 60_000;
const MIN_PAGE_TEXT = 200;

/** A recipe web page: its Recipe JSON-LD when present, else its text */
async function extractWeb(url: string, deadline: Deadline): Promise<ImportSource> {
  const page = await fetchPage(url, { deadline });
  const ld = extractRecipeJsonLd(page.text, page.url);
  const base = {
    images: [],
    sourceName: extractMeta(page.text, "og:site_name"),
    imageUrl: ld?.imageUrl ?? absoluteHttpUrl(extractMeta(page.text, "og:image"), page.url),
    sourceUrl: stripTracking(page.url),
  };

  if (ld) {
    return {
      ...base,
      sections: [{ label: "STRUCTURED DATA", text: JSON.stringify(ld.recipe) }],
      expectedIngredientCount: ld.ingredientCount,
    };
  }

  const text = htmlToText(page.text);
  if (text.length < MIN_PAGE_TEXT) throw new ImportFailure("no_recipe", `page text only ${text.length} chars`);
  return { ...base, sections: [{ label: "PAGE TEXT", text: text.slice(0, PAGE_TEXT_LIMIT) }] };
}

// ── Sources that point somewhere else ──

/** Pinterest/Instagram resolve to another URL; follow at most this many */
const MAX_HOPS = 1;
const CROSS_POST_BUDGET_MS = 5_000;
const MIN_PIN_DESCRIPTION = 200;

async function extractPinterest(url: string, deadline: Deadline, hops: number): Promise<ImportSource> {
  const page = await fetchPage(url, { deadline }); // pin.it short links redirect here
  const post = extractSocialPosting(page.text, page.url);
  const outbound = post?.linkedUrl;

  let outboundFailure: ImportFailure | null = null;
  if (outbound && detectSource(outbound) !== "pinterest" && hops < MAX_HOPS) {
    try {
      return await extractImportSource(outbound, deadline, hops + 1);
    } catch (err) {
      if (!(err instanceof ImportFailure)) throw err;
      outboundFailure = err; // e.g. the recipe site blocks us — try the pin itself
    }
  }

  if (post && post.description.length >= MIN_PIN_DESCRIPTION) {
    return {
      sections: [{ label: "CAPTION", text: post.description }],
      images: [],
      sourceName: creditedSourceName("Pinterest", post.author),
      imageUrl: null,
      sourceUrl: stripTracking(page.url),
    };
  }
  throw outboundFailure ?? new ImportFailure("no_recipe", "pin has no outbound link or description");
}

/** Brave Search for the same video cross-posted to TikTok/YouTube */
async function searchForCrossPost(url: string, deadline: Deadline): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(url)}&count=10`,
      {
        signal: subDeadline(deadline, CROSS_POST_BUDGET_MS).signal,
        headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey },
      },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const results = data?.web?.results as Array<{ url?: unknown }> | undefined;
    const match = results?.find((r) => typeof r.url === "string" && ["tiktok", "youtube"].includes(detectSource(r.url)));
    return (match?.url as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Instagram serves no caption without a login, so look for the same
 *  video on TikTok/YouTube; otherwise the user pastes or screenshots it */
async function extractInstagram(url: string, deadline: Deadline, hops: number): Promise<ImportSource> {
  const crossPost = hops < MAX_HOPS ? await searchForCrossPost(url, deadline) : null;
  if (crossPost) return extractImportSource(crossPost, deadline, hops + 1);
  throw new ImportFailure("blocked", "Instagram requires login; no cross-post found");
}

/** Extract importable content from any supported URL */
export async function extractImportSource(url: string, deadline: Deadline, hops = 0): Promise<ImportSource> {
  switch (detectSource(url)) {
    case "tiktok":
      return extractTikTok(url, deadline);
    case "youtube":
      return extractYouTube(url, deadline);
    case "pinterest":
      return extractPinterest(url, deadline, hops);
    case "instagram":
      return extractInstagram(url, deadline, hops);
    case "web":
      return extractWeb(url, deadline);
  }
}
