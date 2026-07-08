import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, Ingredient, CuisineType, MealType, DifficultyLevel, IngredientCategory, DietaryFlag } from "./types";

// Lazy so importing this module (e.g. in tests) doesn't require an API key
let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  return (anthropicClient ??= new Anthropic());
}

/** Timeout for all outbound fetches — a hung site shouldn't hold the request. */
const FETCH_TIMEOUT_MS = 10_000;

/** Reject URLs that don't point at a public http(s) host (SSRF guard). */
export function assertPublicHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Internal hostnames: localhost, single-label names, .local/.internal
  if (
    host === "localhost" ||
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("URL host is not allowed");
  }

  // IPv4 literals in loopback/private/link-local/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      throw new Error("URL host is not allowed");
    }
  }

  // IPv6 loopback / link-local / unique-local
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    throw new Error("URL host is not allowed");
  }

  return parsed;
}

type VideoPlatform = "tiktok" | "youtube" | "instagram";

const PLATFORM_HOSTNAMES: Record<VideoPlatform, string[]> = {
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "m.tiktok.com"],
  instagram: ["instagram.com", "www.instagram.com"],
  youtube: ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"],
};

/** Detect which video platform a URL belongs to, or null if not a video platform */
function detectVideoPlatform(url: string): VideoPlatform | null {
  try {
    const hostname = new URL(url).hostname;
    for (const [platform, hostnames] of Object.entries(PLATFORM_HOSTNAMES)) {
      if (hostnames.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
        return platform as VideoPlatform;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Check if a URL points to a video platform that can't be HTML-scraped */
export function isVideoUrl(url: string): boolean {
  return detectVideoPlatform(url) !== null;
}

/** Extract og:description or meta description from HTML */
function extractMetaDescription(html: string): string | null {
  // Try og:description first, then fallback to name="description"
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
  );
  if (ogMatch?.[1]) return ogMatch[1];

  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  );
  return descMatch?.[1] ?? null;
}

/** Search for a cross-platform post using Brave Search API */
async function searchForCrossPost(url: string): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(url)}&count=10`,
    {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    },
  );

  if (!response.ok) return null;

  const data = await response.json();
  const results = data?.web?.results as Array<{ url: string }> | undefined;
  if (!results) return null;

  // Look for TikTok or YouTube links in the search results
  for (const result of results) {
    const platform = detectVideoPlatform(result.url);
    if (platform === "tiktok" || platform === "youtube") {
      return result.url;
    }
  }

  return null;
}

/** Fetch TikTok oEmbed data, or null if unavailable */
async function fetchTikTokOEmbed(
  url: string,
): Promise<{ title?: string; author_name?: string } | null> {
  const response = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!response.ok) return null;
  return response.json();
}

/** Follow redirects and return the final URL (for vm.tiktok.com short links) */
async function resolveRedirect(url: string): Promise<string | null> {
  try {
    assertPublicHttpUrl(url);
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return response.url || null;
  } catch {
    return null;
  }
}

/** Extract recipe content from a video platform URL */
export async function extractVideoContent(
  url: string,
): Promise<{ text: string; sourceName: string | null } | null> {
  const platform = detectVideoPlatform(url);
  if (!platform) return null;

  const MIN_CONTENT_LENGTH = 50;

  if (platform === "tiktok") {
    let data = await fetchTikTokOEmbed(url);
    if (!data?.title) {
      // Short links (vm.tiktok.com) sometimes fail oEmbed directly —
      // resolve the redirect to the canonical video URL and retry
      const resolved = await resolveRedirect(url);
      if (resolved && resolved !== url && detectVideoPlatform(resolved) === "tiktok") {
        data = await fetchTikTokOEmbed(resolved);
      }
    }
    const text = data?.title;
    if (!text || text.length < MIN_CONTENT_LENGTH) return null;
    const sourceName = data?.author_name
      ? `TikTok — ${data.author_name}`
      : "TikTok";
    return { text, sourceName };
  }

  if (platform === "youtube") {
    // Combine oEmbed title with HTML meta description
    const parts: string[] = [];

    // oEmbed for title
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    let sourceName: string | null = "YouTube";
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      if (oembedData?.title) parts.push(`Title: ${oembedData.title}`);
      if (oembedData?.author_name) {
        sourceName = `YouTube — ${oembedData.author_name}`;
      }
    }

    // HTML meta tags for description
    try {
      const html = await fetchRecipeHtml(url);
      const description = extractMetaDescription(html);
      if (description) parts.push(`Description: ${description}`);
    } catch {
      // HTML fetch failed — continue with what we have
    }

    const text = parts.join("\n\n");
    if (text.length < MIN_CONTENT_LENGTH) return null;
    return { text, sourceName };
  }

  if (platform === "instagram") {
    // Instagram blocks server-side access — try finding a cross-platform post
    const crossPostUrl = await searchForCrossPost(url);
    if (crossPostUrl) {
      // Recurse with the found TikTok/YouTube URL
      return extractVideoContent(crossPostUrl);
    }
    return null;
  }

  return null;
}

/** JSON Schema enforced via structured outputs — the API guarantees the
 *  response parses and conforms, eliminating malformed-JSON failures. */
const RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "description", "cuisine", "mealType", "difficulty", "servings",
    "totalTimeMinutes", "ingredients", "instructions", "nutrition",
    "dietaryFlags", "tags", "imageUrl", "isSlowCooker", "sourceName",
  ],
  properties: {
    title: { type: "string" },
    description: { anyOf: [{ type: "string" }, { type: "null" }] },
    cuisine: { type: "string", enum: ["american", "italian", "mexican", "asian", "mediterranean", "indian", "middle-eastern", "french", "other"] },
    mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snacks"] },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    servings: { type: "integer" },
    totalTimeMinutes: { anyOf: [{ type: "integer" }, { type: "null" }] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit", "preparation", "category", "raw"],
        properties: {
          name: { type: "string" },
          quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
          unit: { anyOf: [{ type: "string" }, { type: "null" }] },
          preparation: { anyOf: [{ type: "string" }, { type: "null" }] },
          category: { type: "string", enum: ["produce", "meat", "seafood", "dairy", "grain", "canned", "spice", "oil-vinegar", "condiment", "frozen", "other"] },
          raw: { type: "string" },
        },
      },
    },
    instructions: { type: "array", items: { type: "string" } },
    nutrition: {
      type: "object",
      additionalProperties: false,
      required: ["calories", "protein", "carbs", "fat", "saturatedFat", "cholesterol", "fiber", "sodium"],
      properties: {
        calories: { type: "number" },
        protein: { type: "number" },
        carbs: { type: "number" },
        fat: { type: "number" },
        saturatedFat: { type: "number" },
        cholesterol: { type: "number" },
        fiber: { type: "number" },
        sodium: { type: "number" },
      },
    },
    dietaryFlags: {
      type: "array",
      items: { type: "string", enum: ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "shellfish-free", "low-sodium", "low-cholesterol"] },
    },
    tags: { type: "array", items: { type: "string" } },
    imageUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    isSlowCooker: { type: "boolean" },
    sourceName: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

const COMPLETENESS_RULES = `Completeness is critical:
- Include EVERY ingredient that appears in the source, in order — do not omit, merge, or deduplicate any, including garnishes, "for serving" items, and sauce/marinade sub-lists.
- Include EVERY instruction step, in order — do not condense multiple steps into one or drop finishing/serving steps.
- If the source repeats an ingredient in two components (e.g. sauce and marinade), list it twice with its component noted in "preparation".
- "raw" must be the ingredient line exactly as written in the source.`;


const NUTRITION_GUIDELINES = `Nutrition estimation guidelines:
- Estimate per serving based on the ingredients and serving count
- Be realistic — use typical portion sizes
- cholesterol in mg, saturatedFat in g, sodium in mg, fiber in g
- For cholesterol: eggs ~186mg each, shrimp ~170mg/3oz, chicken breast ~85mg/3oz, butter ~31mg/tbsp
- Flag any recipe with >100mg cholesterol per serving as notable

For dietaryFlags: include any that apply — "vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "shellfish-free", "low-sodium" (<=600mg/serving), "low-cholesterol" (<=60mg/serving). Only include flags that are clearly true based on the ingredients.

For isSlowCooker: true if the recipe uses a slow cooker, crock pot, or instant pot on slow cook mode.
For sourceName: infer from the URL/page (e.g., "NYT Cooking", "Stealth Health", "Budget Bytes").`;

const HTML_SYSTEM_PROMPT = `You are a recipe extraction and nutrition estimation assistant. Given the HTML content of a recipe page, extract the recipe data and estimate per-serving nutrition. Prefer structured recipe data embedded in the page (schema.org/Recipe JSON-LD) over the visible text when both are present.

${COMPLETENESS_RULES}

${NUTRITION_GUIDELINES}`;

/** Fetch HTML from a recipe URL */
async function fetchRecipeHtml(url: string): Promise<string> {
  assertPublicHttpUrl(url);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch recipe page: ${response.status}`);
  }

  const html = await response.text();

  // Strip scripts, styles, and excessive whitespace to reduce tokens
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Cap at ~60k chars to stay within context limits
  return cleaned.slice(0, 60_000);
}

const CUISINES: readonly CuisineType[] = ["american", "italian", "mexican", "asian", "mediterranean", "indian", "middle-eastern", "french", "other"];
const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snacks"];
const DIFFICULTIES: readonly DifficultyLevel[] = ["easy", "medium", "hard"];
const INGREDIENT_CATEGORIES: readonly IngredientCategory[] = ["produce", "meat", "seafood", "dairy", "grain", "canned", "spice", "oil-vinegar", "condiment", "frozen", "other"];
const DIETARY_FLAGS: readonly DietaryFlag[] = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "shellfish-free", "low-sodium", "low-cholesterol"];

/** Coerce a value to one of the allowed enum members, or the fallback. */
function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Coerce a value to a finite non-negative number, or the fallback. */
function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Validate the shape of parsed JSON matches ParsedRecipe.
 *  Claude's output is untrusted: enums, numbers, and nested shapes are all
 *  coerced to safe values rather than cast blindly. */
function validateParsedRecipe(data: unknown): ParsedRecipe {
  if (!data || typeof data !== "object") {
    throw new Error("Recipe response is not an object");
  }
  const d = data as Record<string, unknown>;

  if (typeof d.title !== "string" || !d.title) {
    throw new Error("Missing recipe title");
  }
  if (!Array.isArray(d.ingredients) || d.ingredients.length === 0) {
    throw new Error("Missing ingredients");
  }
  if (!Array.isArray(d.instructions) || d.instructions.length === 0) {
    throw new Error("Missing instructions");
  }

  const nutrition = d.nutrition as Record<string, unknown> | null;
  if (!nutrition || typeof nutrition !== "object" || typeof nutrition.calories !== "number") {
    throw new Error("Missing nutrition data");
  }

  const servings = asNumber(d.servings, 4);

  return {
    title: d.title,
    description: asStringOrNull(d.description),
    cuisine: asEnum(d.cuisine, CUISINES, "other"),
    mealType: asEnum(d.mealType, MEAL_TYPES, "dinner"),
    difficulty: asEnum(d.difficulty, DIFFICULTIES, "medium"),
    // servings divides quantities downstream — never allow 0
    servings: Math.max(1, Math.round(servings)),
    totalTimeMinutes: typeof d.totalTimeMinutes === "number" && Number.isFinite(d.totalTimeMinutes) && d.totalTimeMinutes > 0
      ? Math.round(d.totalTimeMinutes)
      : null,
    ingredients: (d.ingredients as Ingredient[]).map((ing) => ({
      name: typeof ing.name === "string" ? ing.name : "",
      quantity: typeof ing.quantity === "number" && Number.isFinite(ing.quantity) ? ing.quantity : null,
      unit: asStringOrNull(ing.unit),
      preparation: asStringOrNull(ing.preparation),
      category: asEnum(ing.category, INGREDIENT_CATEGORIES, "other"),
      raw: typeof ing.raw === "string" && ing.raw
        ? ing.raw
        : `${ing.quantity ?? ""} ${ing.unit ?? ""} ${ing.name ?? ""}`.trim(),
    })),
    instructions: (d.instructions as unknown[]).map(String),
    nutrition: {
      calories: asNumber(nutrition.calories, 0),
      protein: asNumber(nutrition.protein, 0),
      carbs: asNumber(nutrition.carbs, 0),
      fat: asNumber(nutrition.fat, 0),
      saturatedFat: asNumber(nutrition.saturatedFat, 0),
      cholesterol: asNumber(nutrition.cholesterol, 0),
      fiber: asNumber(nutrition.fiber, 0),
      sodium: asNumber(nutrition.sodium, 0),
    },
    dietaryFlags: Array.isArray(d.dietaryFlags)
      ? (d.dietaryFlags as unknown[]).filter((f): f is DietaryFlag => DIETARY_FLAGS.includes(f as DietaryFlag))
      : [],
    tags: Array.isArray(d.tags) ? (d.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    imageUrl: asStringOrNull(d.imageUrl),
    isSlowCooker: d.isSlowCooker === true,
    sourceName: asStringOrNull(d.sourceName),
  };
}

const TEXT_SYSTEM_PROMPT = `You are a recipe extraction and nutrition estimation assistant. Given freeform recipe text (from video captions, notes, messages, etc.), extract the recipe data and estimate per-serving nutrition.

The text may be informal, incomplete, or use shorthand. Do your best to infer missing details (servings, timing, etc.) from context. If ingredients lack quantities, estimate reasonable amounts for a typical recipe.

${COMPLETENESS_RULES}

${NUTRITION_GUIDELINES}`;

/** Send content to Claude and parse the recipe JSON response */
async function callClaudeForRecipe(
  systemPrompt: string,
  userMessage: string,
): Promise<ParsedRecipe> {
  const message = await getAnthropic().messages.create({
    // claude-sonnet-4-20250514 was retired June 2026 (every import 404ed)
    model: "claude-sonnet-5",
    max_tokens: 16000,
    system: systemPrompt,
    // Structured outputs: the response is guaranteed to be valid JSON
    // conforming to the schema — no markdown fences, no missing fields.
    output_config: {
      format: { type: "json_schema", schema: RECIPE_JSON_SCHEMA },
    },
    messages: [{ role: "user", content: userMessage }],
  });

  if (message.stop_reason === "refusal") {
    throw new Error("Claude declined to process this content");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Recipe is too long to extract — try trimming the pasted text");
  }

  const content = message.content.find((block) => block.type === "text");
  if (!content) {
    throw new Error("Unexpected response format from Claude");
  }

  return validateParsedRecipe(JSON.parse(content.text));
}

/** Parse a recipe from a URL using Claude API */
export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  const html = await fetchRecipeHtml(url);
  return callClaudeForRecipe(
    HTML_SYSTEM_PROMPT,
    `Extract the recipe from this page (URL: ${url}):\n\n${html}`,
  );
}

/** Parse a recipe from freeform text (video captions, notes, etc.) */
export async function parseRecipeFromText(
  text: string,
  sourceUrl?: string,
): Promise<ParsedRecipe> {
  const urlContext = sourceUrl ? `\n\nSource URL: ${sourceUrl}` : "";
  return callClaudeForRecipe(
    TEXT_SYSTEM_PROMPT,
    `Extract the recipe from the following text:${urlContext}\n\n${text}`,
  );
}
