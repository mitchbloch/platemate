import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, Ingredient, CuisineType, MealType, DifficultyLevel, IngredientCategory, DietaryFlag } from "./types";

const anthropic = new Anthropic();

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

/** Extract recipe content from a video platform URL */
export async function extractVideoContent(
  url: string,
): Promise<{ text: string; sourceName: string | null } | null> {
  const platform = detectVideoPlatform(url);
  if (!platform) return null;

  const MIN_CONTENT_LENGTH = 50;

  if (platform === "tiktok") {
    const response = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.title as string | undefined;
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

const RECIPE_SCHEMA = `{
  "title": string,
  "description": string | null,
  "cuisine": "american" | "italian" | "mexican" | "asian" | "mediterranean" | "indian" | "middle-eastern" | "french" | "other",
  "mealType": "breakfast" | "lunch" | "dinner" | "snacks",
  "difficulty": "easy" | "medium" | "hard",
  "servings": number,
  "totalTimeMinutes": number | null,
  "ingredients": [
    {
      "name": string,
      "quantity": number | null,
      "unit": string | null,
      "preparation": string | null,
      "category": "produce" | "meat" | "seafood" | "dairy" | "grain" | "canned" | "spice" | "oil-vinegar" | "condiment" | "frozen" | "other",
      "raw": string
    }
  ],
  "instructions": [string],
  "nutrition": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "saturatedFat": number,
    "cholesterol": number,
    "fiber": number,
    "sodium": number
  },
  "dietaryFlags": ["vegetarian" | "vegan" | "gluten-free" | "dairy-free" | "nut-free" | "shellfish-free" | "low-sodium" | "low-cholesterol"],
  "tags": [string],
  "imageUrl": string | null,
  "isSlowCooker": boolean,
  "sourceName": string | null
}`;

const NUTRITION_GUIDELINES = `Nutrition estimation guidelines:
- Estimate per serving based on the ingredients and serving count
- Be realistic — use typical portion sizes
- cholesterol in mg, saturatedFat in g, sodium in mg, fiber in g
- For cholesterol: eggs ~186mg each, shrimp ~170mg/3oz, chicken breast ~85mg/3oz, butter ~31mg/tbsp
- Flag any recipe with >100mg cholesterol per serving as notable

For dietaryFlags: include any that apply — "vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "shellfish-free", "low-sodium" (<=600mg/serving), "low-cholesterol" (<=60mg/serving). Only include flags that are clearly true based on the ingredients.

For isSlowCooker: true if the recipe uses a slow cooker, crock pot, or instant pot on slow cook mode.
For sourceName: infer from the URL/page (e.g., "NYT Cooking", "Stealth Health", "Budget Bytes").`;

const HTML_SYSTEM_PROMPT = `You are a recipe extraction and nutrition estimation assistant. Given the HTML content of a recipe page, extract the recipe data and estimate per-serving nutrition.

Return ONLY valid JSON matching this schema (no markdown, no explanation):

${RECIPE_SCHEMA}

${NUTRITION_GUIDELINES}`;

/** Fetch HTML from a recipe URL */
async function fetchRecipeHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
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

/** Validate the shape of parsed JSON matches ParsedRecipe */
function validateParsedRecipe(data: unknown): ParsedRecipe {
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
  if (!nutrition || typeof nutrition.calories !== "number") {
    throw new Error("Missing nutrition data");
  }

  return {
    title: d.title as string,
    description: (d.description as string) ?? null,
    cuisine: (d.cuisine as CuisineType) ?? "other",
    mealType: (d.mealType as MealType) ?? "dinner",
    difficulty: (d.difficulty as DifficultyLevel) ?? "medium",
    servings: (d.servings as number) ?? 4,
    totalTimeMinutes: (d.totalTimeMinutes as number) ?? null,
    ingredients: (d.ingredients as Ingredient[]).map((ing) => ({
      name: ing.name ?? "",
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      preparation: ing.preparation ?? null,
      category: (ing.category as IngredientCategory) ?? "other",
      raw: ing.raw ?? `${ing.quantity ?? ""} ${ing.unit ?? ""} ${ing.name}`.trim(),
    })),
    instructions: d.instructions as string[],
    nutrition: {
      calories: nutrition.calories as number,
      protein: (nutrition.protein as number) ?? 0,
      carbs: (nutrition.carbs as number) ?? 0,
      fat: (nutrition.fat as number) ?? 0,
      saturatedFat: (nutrition.saturatedFat as number) ?? 0,
      cholesterol: (nutrition.cholesterol as number) ?? 0,
      fiber: (nutrition.fiber as number) ?? 0,
      sodium: (nutrition.sodium as number) ?? 0,
    },
    dietaryFlags: Array.isArray(d.dietaryFlags) ? (d.dietaryFlags as DietaryFlag[]) : [],
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    imageUrl: (d.imageUrl as string) ?? null,
    isSlowCooker: (d.isSlowCooker as boolean) ?? false,
    sourceName: (d.sourceName as string) ?? null,
  };
}

const TEXT_SYSTEM_PROMPT = `You are a recipe extraction and nutrition estimation assistant. Given freeform recipe text (from video captions, notes, messages, etc.), extract the recipe data and estimate per-serving nutrition.

The text may be informal, incomplete, or use shorthand. Do your best to infer missing details (servings, timing, etc.) from context. If ingredients lack quantities, estimate reasonable amounts for a typical recipe.

Return ONLY valid JSON matching this schema (no markdown, no explanation):

${RECIPE_SCHEMA}

${NUTRITION_GUIDELINES}`;

/** Send content to Claude and parse the recipe JSON response */
async function callClaudeForRecipe(
  systemPrompt: string,
  userMessage: string,
): Promise<ParsedRecipe> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text);
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error("Failed to parse Claude response as JSON");
    }
  }

  return validateParsedRecipe(parsed);
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
