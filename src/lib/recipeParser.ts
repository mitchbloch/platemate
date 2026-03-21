import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, Ingredient, CuisineType, MealType, DifficultyLevel, IngredientCategory } from "./types";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a recipe extraction and nutrition estimation assistant. Given the HTML content of a recipe page, extract the recipe data and estimate per-serving nutrition.

Return ONLY valid JSON matching this schema (no markdown, no explanation):

{
  "title": string,
  "description": string | null,
  "cuisine": "american" | "italian" | "mexican" | "asian" | "mediterranean" | "indian" | "middle-eastern" | "french" | "other",
  "mealType": "dinner" | "slow-cooker-lunch",
  "difficulty": "easy" | "medium" | "hard",
  "servings": number,
  "prepTimeMinutes": number | null,
  "cookTimeMinutes": number | null,
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
  "tags": [string],
  "imageUrl": string | null,
  "isSlowCooker": boolean,
  "sourceName": string | null
}

Nutrition estimation guidelines:
- Estimate per serving based on the ingredients and serving count
- Be realistic — use typical portion sizes
- cholesterol in mg, saturatedFat in g, sodium in mg, fiber in g
- For cholesterol: eggs ~186mg each, shrimp ~170mg/3oz, chicken breast ~85mg/3oz, butter ~31mg/tbsp
- Flag any recipe with >100mg cholesterol per serving as notable

For isSlowCooker: true if the recipe uses a slow cooker, crock pot, or instant pot on slow cook mode.
For sourceName: infer from the URL/page (e.g., "NYT Cooking", "Stealth Health", "Budget Bytes").`;

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
    prepTimeMinutes: (d.prepTimeMinutes as number) ?? null,
    cookTimeMinutes: (d.cookTimeMinutes as number) ?? null,
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
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    imageUrl: (d.imageUrl as string) ?? null,
    isSlowCooker: (d.isSlowCooker as boolean) ?? false,
    sourceName: (d.sourceName as string) ?? null,
  };
}

/** Parse a recipe from a URL using Claude API */
export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  const html = await fetchRecipeHtml(url);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract the recipe from this page (URL: ${url}):\n\n${html}`,
      },
    ],
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
