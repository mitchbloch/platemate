import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, Ingredient, DietaryFlag } from "./types";
import {
  CUISINES,
  MEAL_TYPES,
  DIFFICULTIES,
  INGREDIENT_CATEGORIES,
  DIETARY_FLAGS,
  asEnum,
  asNumber,
  asStringOrNull,
} from "./recipeValidation";
import { SHOPPING_NAME_RULES, normalizeShoppingName } from "./shoppingName";
import { ImportFailure, type Deadline } from "./import/fetchPage";
import type { ImportSource } from "./import";

// Lazy so importing this module (e.g. in tests) doesn't require an API key
let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  return (anthropicClient ??= new Anthropic());
}

/** JSON Schema enforced via structured outputs — the API guarantees the
 *  response parses and conforms, eliminating malformed-JSON failures. */
export const RECIPE_JSON_SCHEMA = {
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
        required: ["name", "quantity", "unit", "preparation", "category", "raw", "shoppingName"],
        properties: {
          name: { type: "string" },
          quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
          unit: { anyOf: [{ type: "string" }, { type: "null" }] },
          preparation: { anyOf: [{ type: "string" }, { type: "null" }] },
          category: { type: "string", enum: ["produce", "meat", "seafood", "dairy", "grain", "canned", "spice", "oil-vinegar", "condiment", "frozen", "other"] },
          raw: { type: "string" },
          shoppingName: { type: "string" },
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
- "raw" must be the ingredient line exactly as written in the source.

${SHOPPING_NAME_RULES}`;


const NUTRITION_GUIDELINES = `Nutrition estimation guidelines:
- Estimate per serving based on the ingredients and serving count
- Be realistic — use typical portion sizes
- cholesterol in mg, saturatedFat in g, sodium in mg, fiber in g
- For cholesterol: eggs ~186mg each, shrimp ~170mg/3oz, chicken breast ~85mg/3oz, butter ~31mg/tbsp
- Flag any recipe with >100mg cholesterol per serving as notable

For dietaryFlags: include any that apply — "vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "shellfish-free", "low-sodium" (<=600mg/serving), "low-cholesterol" (<=60mg/serving). Only include flags that are clearly true based on the ingredients.

For isSlowCooker: true if the recipe uses a slow cooker, crock pot, or instant pot on slow cook mode.
For sourceName: infer from the URL/page (e.g., "NYT Cooking", "Stealth Health", "Budget Bytes").
For imageUrl: return null (the image is taken from the page separately).`;

/** One prompt for every input — page, video, pasted text, screenshots — so
 *  the rules can't drift between import paths. */
const SYSTEM_PROMPT = `You are a recipe extraction and nutrition estimation assistant. You receive content about one recipe as labeled sections, possibly with screenshots or photos. Extract the recipe and estimate per-serving nutrition.

Sections you may receive:
- STRUCTURED DATA: schema.org Recipe JSON published by the recipe page. It is the most reliable source: use its ingredient lines ("raw" = each recipeIngredient line verbatim) and its instructions (a {"section", "steps"} item is a named group — keep the group name in each step, e.g. "Sauce: Whisk..."). recipeYield may be free text; durations are ISO 8601 (PT1H15M = 75 minutes). When it includes nutrition, use those per-serving values and estimate only the fields it lacks.
- PAGE TEXT: the visible text of a web page.
- CAPTION: the creator's caption or video description.
- TRANSCRIPT: an auto-generated transcript of the spoken audio. It may contain recognition errors. Use it to fill in quantities and steps the caption leaves out; when they conflict, the caption wins.
- USER TEXT: text the user pasted (notes, a caption, a message).
- Images: screenshots or photos (a caption, comments, a recipe card, a cookbook page). Read all of the recipe text in them and ignore app interface elements. Several images may be consecutive parts of one recipe.

The content may be informal or incomplete. When it describes a recipe, infer reasonable missing details (servings, timing, quantities for a typical recipe). When it does not contain a recipe — for example "recipe in bio", a teaser for a paywalled post, or an unrelated page — do not invent one: return empty "ingredients" and "instructions" arrays.

${COMPLETENESS_RULES}

${NUTRITION_GUIDELINES}`;

/** Validate the shape of parsed JSON matches ParsedRecipe.
 *  Claude's output is untrusted: enums, numbers, and nested shapes are all
 *  coerced to safe values rather than cast blindly. */
export function validateParsedRecipe(data: unknown): ParsedRecipe {
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
      shoppingName: normalizeShoppingName(ing.shoppingName),
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

// Seconds Claude may spend when the caller has no deadline (pasted text)
const DEFAULT_CLAUDE_TIMEOUT_MS = 50_000;
// Leave room to serialize the response before the function's maxDuration
const RESPONSE_MARGIN_MS = 3_000;

/** The user message: images first (the vision guidance in Anthropic's docs),
 *  then each labeled section. */
export function buildRecipeRequestContent(source: ImportSource): Anthropic.MessageParam["content"] {
  const header = source.sourceUrl ? `Extract the recipe.\n\nSource URL: ${source.sourceUrl}` : "Extract the recipe.";
  const text = [header, ...source.sections.map((s) => `=== ${s.label} ===\n${s.text}`)].join("\n\n");
  if (source.images.length === 0) return text;
  return [
    ...source.images.map((data) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
    })),
    { type: "text" as const, text },
  ];
}

/** One Claude call: extracted source → validated ParsedRecipe. Throws
 *  ImportFailure("no_recipe") when the content holds no recipe. */
export async function parseRecipe(source: ImportSource, deadline?: Deadline): Promise<ParsedRecipe> {
  const timeout = deadline ? deadline.remainingMs() - RESPONSE_MARGIN_MS : DEFAULT_CLAUDE_TIMEOUT_MS;
  if (timeout <= 0) throw new ImportFailure("fetch_failed", "no time left for extraction");

  const message = await getAnthropic().messages.create(
    {
      // claude-sonnet-4-20250514 was retired June 2026 (every import 404ed)
      model: "claude-sonnet-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // Structured outputs: the response is guaranteed to be valid JSON
      // conforming to the schema — no markdown fences, no missing fields.
      output_config: {
        format: { type: "json_schema", schema: RECIPE_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: buildRecipeRequestContent(source) }],
    },
    { timeout, signal: deadline?.signal, maxRetries: deadline ? 0 : undefined },
  );

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

  const data: unknown = JSON.parse(content.text);
  const ingredients = (data as { ingredients?: unknown })?.ingredients;
  if (Array.isArray(ingredients) && ingredients.length === 0) {
    throw new ImportFailure("no_recipe", "model found no recipe in the content");
  }
  const recipe = validateParsedRecipe(data);

  if (source.expectedIngredientCount !== undefined && recipe.ingredients.length !== source.expectedIngredientCount) {
    console.warn("[import] ingredient count mismatch", {
      sourceUrl: source.sourceUrl,
      structured: source.expectedIngredientCount,
      parsed: recipe.ingredients.length,
    });
  }

  // Deterministic facts from extraction beat the model's guesses
  return {
    ...recipe,
    sourceName: source.sourceName ?? recipe.sourceName,
    imageUrl: source.imageUrl,
  };
}

/** Parse freeform text the user pasted (captions, notes, messages) */
export async function parseRecipeFromText(text: string, sourceUrl?: string): Promise<ParsedRecipe> {
  return parseRecipe({
    sections: [{ label: "USER TEXT", text }],
    images: [],
    sourceName: null,
    imageUrl: null,
    sourceUrl: sourceUrl ?? null,
  });
}
