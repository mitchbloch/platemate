import { detectSource, stripTracking } from "./platforms";
import { createDeadline, fetchPage, ImportFailure, type Deadline } from "./fetchPage";
import { extractRecipeJsonLd } from "./jsonLd";
import { extractMeta, htmlToText } from "./text";
import { extractTikTok } from "./tiktok";

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

/** Visible page text sent when a site has no Recipe JSON-LD. Text, not
 *  HTML, so 60k covers far more of the page than the old HTML cut did. */
const PAGE_TEXT_LIMIT = 60_000;
const MIN_PAGE_TEXT = 200;

function absoluteUrl(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A recipe web page: its Recipe JSON-LD when present, else its text */
async function extractWeb(url: string, deadline: Deadline): Promise<ImportSource> {
  const page = await fetchPage(url, { deadline });
  const ld = extractRecipeJsonLd(page.text, page.url);
  const base = {
    images: [],
    sourceName: extractMeta(page.text, "og:site_name"),
    imageUrl: ld?.imageUrl ?? absoluteUrl(extractMeta(page.text, "og:image"), page.url),
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

// ── Video platforms (pre-Phase 9 logic, replaced platform by platform) ──

const FETCH_TIMEOUT_MS = 10_000;
const MIN_CONTENT_LENGTH = 50;

async function searchForCrossPost(url: string): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(url)}&count=10`,
    {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey },
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  const results = data?.web?.results as Array<{ url: string }> | undefined;
  return results?.find((r) => ["tiktok", "youtube"].includes(detectSource(r.url)))?.url ?? null;
}

async function extractVideo(url: string): Promise<{ text: string; sourceName: string | null } | null> {
  const platform = detectSource(url);

  if (platform === "youtube") {
    const parts: string[] = [];
    let sourceName: string | null = "YouTube";
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      if (oembedData?.title) parts.push(`Title: ${oembedData.title}`);
      if (oembedData?.author_name) sourceName = `YouTube — ${oembedData.author_name}`;
    }
    try {
      const page = await fetchPage(url, { deadline: createDeadline(FETCH_TIMEOUT_MS) });
      const description = extractMeta(page.text, "og:description") ?? extractMeta(page.text, "description");
      if (description) parts.push(`Description: ${description}`);
    } catch {
      // continue with what we have
    }
    const text = parts.join("\n\n");
    return text.length < MIN_CONTENT_LENGTH ? null : { text, sourceName };
  }

  if (platform === "instagram") {
    const crossPostUrl = await searchForCrossPost(url);
    return crossPostUrl ? extractVideo(crossPostUrl) : null;
  }

  return null;
}

/** Extract importable content from any supported URL */
export async function extractImportSource(url: string, deadline: Deadline): Promise<ImportSource> {
  const kind = detectSource(url);
  if (kind === "web" || kind === "pinterest") return extractWeb(url, deadline);
  if (kind === "tiktok") return extractTikTok(url, deadline);

  const video = await extractVideo(url);
  if (!video) throw new ImportFailure("no_recipe", `no caption from ${kind}`);
  return {
    sections: [{ label: "CAPTION", text: video.text }],
    images: [],
    sourceName: video.sourceName,
    imageUrl: null,
    sourceUrl: stripTracking(url),
  };
}
