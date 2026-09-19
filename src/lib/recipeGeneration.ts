/**
 * Recipe generation: prompt, response contract, and validation. Pure —
 * the API route owns I/O so this can be tested without the network.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { RECIPE_JSON_SCHEMA, validateParsedRecipe } from "./recipeParser";
import { SHOPPING_NAME_RULES } from "./shoppingName";
import { NUTRITION_LABELS, DIETARY_FLAG_LABELS } from "./types";
import type {
  DietaryFlag,
  GenerationMessage,
  GenerationOption,
  Household,
  LibraryMatch,
  NutritionInfo,
  ParsedRecipe,
  Recipe,
} from "./types";

export const GENERATION_MODEL = "claude-sonnet-5";
export const MAX_TURNS = 20;
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 600_000; // base64 length, ≈450KB of JPEG
export const MAX_OPTIONS = 3;
export const MAX_LIBRARY_MATCHES = 5;
export const MAX_MESSAGE_CHARS = 4_000;

// ── Response contract ──

export const GENERATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "options", "recipe", "libraryMatches", "seenIngredients"],
  properties: {
    reply: { type: "string" },
    options: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary"],
            properties: { title: { type: "string" }, summary: { type: "string" } },
          },
        },
      ],
    },
    recipe: { anyOf: [{ type: "null" }, RECIPE_JSON_SCHEMA] },
    libraryMatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["recipeId", "reason"],
        properties: { recipeId: { type: "string" }, reason: { type: "string" } },
      },
    },
    seenIngredients: { type: "array", items: { type: "string" } },
  },
} as const;

export interface GenerationTurnResult {
  reply: string;
  options: GenerationOption[] | null;
  recipe: ParsedRecipe | null;
  libraryMatches: LibraryMatch[];
  seenIngredients: string[];
}

// ── Prompt ──

const ROLE = `You are Platemate's recipe assistant for one household. You help them decide what to cook and produce recipes they can save straight into their library.

How to respond each turn:
- If the request is still open-ended (several dishes would fit), offer up to ${MAX_OPTIONS} "options": short titles with a one-line summary each, and leave "recipe" null. Keep "reply" to a sentence or two.
- Once a direction is clear (they picked an option, or the request was specific), produce ONE complete "recipe" and leave "options" null. "reply" then briefly says what you made and invites tweaks.
- When they ask for changes, return the full updated "recipe" again, not a diff.
- If they attached photos of ingredients, list every food item you can see in "seenIngredients" (empty otherwise) and build on those. When they mainly want to use what they have, prefer recipes that need few extra purchases.
- "libraryMatches": recipes from their existing library (below) that genuinely fit the request or use the ingredients at hand — up to ${MAX_LIBRARY_MATCHES}, with a short reason each. Only ids from the library list. Empty when nothing fits.
- Never invent a library id. Never include a recipe when you are still offering options.`;

const RECIPE_RULES = `Recipe requirements (when "recipe" is not null):
- Complete: every ingredient with a realistic quantity and unit, every step in order.
- Structured exactly like the schema; "raw" is the ingredient line as a cook would write it (e.g. "2 tbsp olive oil").
- Estimate per-serving nutrition honestly. Cholesterol in mg, saturatedFat in g, sodium in mg.
- sourceName: "Generated with Platemate". imageUrl: null.
${SHOPPING_NAME_RULES}`;

function nutrientLabel(n: keyof NutritionInfo): string {
  return NUTRITION_LABELS[n] ?? n;
}

/** Household context: constraints the generator must respect. */
export function householdContext(household: Pick<Household, "dietaryPreferences" | "nutritionPriorities" | "defaultServings">): string {
  const lines: string[] = [];
  lines.push(`Default servings: ${household.defaultServings} (use this unless asked otherwise).`);
  if (household.dietaryPreferences.length > 0) {
    lines.push(`Dietary requirements (hard constraints): ${household.dietaryPreferences.join(", ")}.`);
  }
  if (household.nutritionPriorities.length > 0) {
    const ranked = [...household.nutritionPriorities].sort((a, b) => a.rank - b.rank).map((p) => nutrientLabel(p.nutrient));
    lines.push(`Nutrition priorities, most important first: ${ranked.join(", ")}. Keep these low per serving where it doesn't hurt the dish, and say so when a request conflicts (e.g. a cholesterol-heavy classic) — offer a lighter variant alongside.`);
  }
  return lines.join("\n");
}

/** One line per library recipe: id | title | ingredient names. Cached as a
 *  stable prefix block, so keep it deterministic (sorted by id). */
export function libraryDigest(recipes: Pick<Recipe, "id" | "title" | "ingredients">[]): string {
  if (recipes.length === 0) return "The household's recipe library is empty.";
  const lines = [...recipes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id} | ${r.title} | ${r.ingredients.map((i) => i.shoppingName || i.name).join(", ")}`);
  return `Household recipe library (id | title | ingredients):\n${lines.join("\n")}`;
}

/** System prompt as blocks: everything static first, the (large) library
 *  digest last with the cache breakpoint so the whole prefix is reused. */
export function buildSystemBlocks(
  household: Pick<Household, "dietaryPreferences" | "nutritionPriorities" | "defaultServings">,
  recipes: Pick<Recipe, "id" | "title" | "ingredients">[],
): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: `${ROLE}\n\n${RECIPE_RULES}\n\n${householdContext(household)}` },
    { type: "text", text: libraryDigest(recipes), cache_control: { type: "ephemeral" } },
  ];
}

/** Persisted turns → API messages. Photos were not stored, so a user turn
 *  that had them is replayed as a marker plus what Claude saw. */
export function toApiMessages(history: GenerationMessage[]): Anthropic.MessageParam[] {
  return history.map((m) => {
    if (m.role === "user") {
      const marker =
        m.photoCount > 0
          ? `\n\n[${m.photoCount} photo${m.photoCount === 1 ? "" : "s"} attached earlier. Ingredients seen: ${m.seenIngredients.join(", ") || "none identified"}]`
          : "";
      return { role: "user", content: `${m.content}${marker}` };
    }
    const { reply, options, recipe, libraryMatches } = m;
    return {
      role: "assistant",
      content: JSON.stringify({ reply, options, recipe, libraryMatches: libraryMatches.map((l) => ({ recipeId: l.recipeId, reason: l.reason })), seenIngredients: [] }),
    };
  });
}

/** The new user turn, with any photos as image blocks before the text. */
export function userTurnContent(message: string, imagesBase64: string[]): Anthropic.MessageParam["content"] {
  if (imagesBase64.length === 0) return message;
  return [
    ...imagesBase64.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
    { type: "text" as const, text: message },
  ];
}

// ── Validation of Claude's answer ──

function asOptions(value: unknown): GenerationOption[] | null {
  if (!Array.isArray(value)) return null;
  const options = value
    .filter((o): o is { title: unknown; summary: unknown } => !!o && typeof o === "object")
    .map((o) => ({ title: String(o.title ?? "").trim(), summary: String(o.summary ?? "").trim() }))
    .filter((o) => o.title)
    .slice(0, MAX_OPTIONS);
  return options.length > 0 ? options : null;
}

/** Coerce the structured output into a turn result. Library matches are
 *  filtered to ids the household actually owns; a recipe that fails
 *  validation is dropped (the reply still goes through). */
export function validateGenerationResponse(
  data: unknown,
  library: Pick<Recipe, "id" | "title">[],
): GenerationTurnResult {
  if (!data || typeof data !== "object") throw new Error("Generator returned no answer");
  const d = data as Record<string, unknown>;
  const reply = typeof d.reply === "string" ? d.reply.trim() : "";

  let recipe: ParsedRecipe | null = null;
  if (d.recipe && typeof d.recipe === "object") {
    try {
      recipe = validateParsedRecipe(d.recipe);
      recipe = { ...recipe, sourceName: "Generated with Platemate", imageUrl: null };
    } catch {
      recipe = null;
    }
  }

  // Options and a recipe are mutually exclusive; a full recipe wins.
  const options = recipe ? null : asOptions(d.options);

  const byId = new Map(library.map((r) => [r.id, r.title]));
  const seen = new Set<string>();
  const libraryMatches: LibraryMatch[] = (Array.isArray(d.libraryMatches) ? d.libraryMatches : [])
    .filter((m): m is { recipeId: unknown; reason: unknown } => !!m && typeof m === "object")
    .map((m) => ({ recipeId: String(m.recipeId ?? ""), reason: String(m.reason ?? "").trim() }))
    .filter((m) => byId.has(m.recipeId) && !seen.has(m.recipeId) && seen.add(m.recipeId))
    .map((m) => ({ ...m, title: byId.get(m.recipeId)! }))
    .slice(0, MAX_LIBRARY_MATCHES);

  const seenIngredients = (Array.isArray(d.seenIngredients) ? d.seenIngredients : [])
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim().toLowerCase())
    .slice(0, 60);

  if (!reply && !recipe && !options && libraryMatches.length === 0) {
    throw new Error("Generator returned an empty answer");
  }
  return { reply: reply || (recipe ? `Here's ${recipe.title}.` : "Here are some directions."), options, recipe, libraryMatches, seenIngredients };
}

// ── Request validation ──

export interface GenerateRequest {
  generationId: string | null;
  message: string;
  images: string[];
}

export function validateGenerateRequest(body: unknown): { ok: true; request: GenerateRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const images = Array.isArray(b.images) ? b.images : [];
  if (!message && images.length === 0) return { ok: false, error: "Say what you'd like to cook, or add a photo" };
  if (message.length > MAX_MESSAGE_CHARS) return { ok: false, error: `Message is too long (max ${MAX_MESSAGE_CHARS.toLocaleString()} characters)` };
  if (images.length > MAX_PHOTOS) return { ok: false, error: `Up to ${MAX_PHOTOS} photos per message` };
  for (const img of images) {
    if (typeof img !== "string" || !/^[A-Za-z0-9+/=]+$/.test(img)) return { ok: false, error: "Photos must be base64 JPEG" };
    if (img.length > MAX_PHOTO_BYTES) return { ok: false, error: "A photo is too large — try a smaller one" };
  }
  const generationId = typeof b.generationId === "string" && b.generationId ? b.generationId : null;
  return { ok: true, request: { generationId, message: message || "(see photo)", images: images as string[] } };
}

/** Dietary flag labels, for showing constraints in the UI. */
export function dietaryLabel(flag: string): string {
  return DIETARY_FLAG_LABELS[flag as DietaryFlag] ?? flag;
}
