import { cleanInlineText } from "./text";

/** schema.org/Recipe data embedded in a page — the structured "recipe
 *  card" most sites publish for search engines. Far smaller and more
 *  complete than the page text, so it's what Claude gets when present. */
export interface JsonLdRecipe {
  /** Pruned to recipe fields, strings cleaned */
  recipe: Record<string, unknown>;
  ingredientCount: number;
  imageUrl: string | null;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function isRecipe(node: Json): boolean {
  return asArray(node["@type"]).some(
    (t) => typeof t === "string" && (t === "Recipe" || t.endsWith(":Recipe") || t.endsWith("/Recipe")),
  );
}

/** Every Recipe node, wherever the site nested it */
function collectRecipes(node: unknown, out: Json[], depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(node)) {
    for (const item of node) collectRecipes(item, out, depth + 1);
    return;
  }
  if (!isObject(node)) return;
  if (isRecipe(node)) out.push(node);
  for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
    if (key in node) collectRecipes(node[key], out, depth + 1);
  }
}

function parseBlock(raw: string): unknown {
  const body = raw.replace(/^\s*(<!--|<!\[CDATA\[)/, "").replace(/(-->|\]\]>)\s*$/, "").trim();
  try {
    return JSON.parse(body);
  } catch {
    try {
      // Some CMSes emit raw newlines/tabs inside strings, which JSON forbids
      return JSON.parse(body.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return null;
    }
  }
}

function ingredientsOf(recipe: Json): string[] {
  return asArray(recipe.recipeIngredient ?? recipe.ingredients)
    .filter((i): i is string => typeof i === "string")
    .map(cleanInlineText)
    .filter(Boolean);
}

/** Instructions flattened to strings, HowToSection kept as a named group */
function instructionsOf(value: unknown): unknown[] {
  const steps: unknown[] = [];
  for (const item of asArray(value)) {
    if (typeof item === "string") {
      // A single string sometimes holds the whole method, one step per line
      for (const line of item.split(/\n+|<br\s*\/?>|<\/p>/i)) {
        const text = cleanInlineText(line);
        if (text) steps.push(text);
      }
    } else if (isObject(item)) {
      if (asArray(item["@type"]).includes("HowToSection") || ("itemListElement" in item && !("text" in item))) {
        const sectionSteps = instructionsOf(item.itemListElement);
        if (sectionSteps.length) {
          steps.push({ section: typeof item.name === "string" ? cleanInlineText(item.name) : null, steps: sectionSteps });
        }
      } else {
        const text = cleanInlineText(String(item.text ?? item.name ?? ""));
        if (text) steps.push(text);
      }
    }
  }
  return steps;
}

const NUTRITION_KEYS = [
  "servingSize", "calories", "proteinContent", "carbohydrateContent", "fatContent", "saturatedFatContent",
  "cholesterolContent", "sodiumContent", "fiberContent", "sugarContent",
];

function nutritionOf(value: unknown): Json | undefined {
  if (!isObject(value)) return undefined;
  const out: Json = {};
  for (const key of NUTRITION_KEYS) {
    if (typeof value[key] === "string" || typeof value[key] === "number") out[key] = value[key];
  }
  return Object.keys(out).length ? out : undefined;
}

function namesOf(value: unknown): string[] {
  return asArray(value)
    .map((a) => (typeof a === "string" ? a : isObject(a) && typeof a.name === "string" ? a.name : ""))
    .map(cleanInlineText)
    .filter(Boolean);
}

function textList(value: unknown): string | undefined {
  const parts = asArray(value).filter((v): v is string | number => typeof v === "string" || typeof v === "number");
  const joined = cleanInlineText(parts.join(", "));
  return joined || undefined;
}

function imageOf(value: unknown, pageUrl: string): string | null {
  for (const item of asArray(value)) {
    const raw = typeof item === "string" ? item : isObject(item) ? (item.url ?? item.contentUrl) : null;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const url = new URL(raw.trim(), pageUrl);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

function prune(recipe: Json, ingredients: string[], instructions: unknown[]): Json {
  const out: Json = {
    name: typeof recipe.name === "string" ? cleanInlineText(recipe.name) : undefined,
    description: typeof recipe.description === "string" ? cleanInlineText(recipe.description) : undefined,
    recipeYield: textList(recipe.recipeYield),
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    recipeIngredient: ingredients,
    recipeInstructions: instructions,
    nutrition: nutritionOf(recipe.nutrition),
    recipeCategory: textList(recipe.recipeCategory),
    recipeCuisine: textList(recipe.recipeCuisine),
    cookingMethod: textList(recipe.cookingMethod),
    keywords: textList(recipe.keywords),
    suitableForDiet: textList(recipe.suitableForDiet),
    author: namesOf(recipe.author).join(", ") || undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== ""));
}

/** Every parseable `application/ld+json` block on the page; malformed ones are skipped */
export function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseBlock(m[1]);
    if (parsed !== null) blocks.push(parsed);
  }
  return blocks;
}

/** The page's Recipe JSON-LD, or null when there is none worth using
 *  (no ingredients or no instructions → caller falls back to page text). */
export function extractRecipeJsonLd(html: string, pageUrl: string): JsonLdRecipe | null {
  const candidates: { recipe: Json; ingredients: string[]; instructions: unknown[] }[] = [];
  for (const block of parseJsonLdBlocks(html)) {
    const found: Json[] = [];
    collectRecipes(block, found);
    for (const recipe of found) {
      const ingredients = ingredientsOf(recipe);
      const instructions = instructionsOf(recipe.recipeInstructions);
      if (ingredients.length && instructions.length) candidates.push({ recipe, ingredients, instructions });
    }
  }
  if (candidates.length === 0) return null;

  // Several recipes (roundups, "you might also like"): the one this page is
  // about, else the most complete
  const page = normalizeUrl(pageUrl);
  const best =
    candidates.find((c) => typeof c.recipe.url === "string" && normalizeUrl(c.recipe.url) === page) ??
    candidates.reduce((a, b) => (b.ingredients.length > a.ingredients.length ? b : a));

  return {
    recipe: prune(best.recipe, best.ingredients, best.instructions),
    ingredientCount: best.ingredients.length,
    imageUrl: imageOf(best.recipe.image ?? best.recipe.thumbnailUrl, pageUrl),
  };
}
