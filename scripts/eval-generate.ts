/**
 * Live eval of the recipe-generation prompt against the real Claude API —
 * no web layer, no auth. Fake household + a 3-recipe library; three turns
 * (open request → pick an option → revise). Run: npm run eval:generate
 * Needs ANTHROPIC_API_KEY in .env.local. Costs a few cents.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { GENERATION_MODEL, GENERATION_RESPONSE_SCHEMA, buildSystemBlocks, toApiMessages, userTurnContent, validateGenerationResponse } from "../src/lib/recipeGeneration";
import type { GenerationMessage } from "../src/lib/types";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = new Anthropic();
const household = { defaultServings: 2, dietaryPreferences: [] as string[], nutritionPriorities: [{ nutrient: "cholesterol" as const, rank: 1 }, { nutrient: "saturatedFat" as const, rank: 2 }] };
const library = [
  { id: "lib-1", title: "Chicken Tacos", ingredients: [{ name: "chicken thighs", shoppingName: "chicken thighs", quantity: 1, unit: "lb", preparation: null, category: "meat" as const, raw: "" }, { name: "tortillas", quantity: 8, unit: null, preparation: null, category: "grain" as const, raw: "" }] },
  { id: "lib-2", title: "Lentil Soup", ingredients: [{ name: "lentils", quantity: 1, unit: "cup", preparation: null, category: "grain" as const, raw: "" }] },
  { id: "lib-3", title: "Greek Yogurt Bowl", ingredients: [{ name: "greek yogurt", quantity: 1, unit: "cup", preparation: null, category: "dairy" as const, raw: "" }] },
];
const history: GenerationMessage[] = [];
async function turn(message: string) {
  const t0 = Date.now();
  const res = await client.messages.create({
    model: GENERATION_MODEL, max_tokens: 16000, system: buildSystemBlocks(household, library),
    messages: [...toApiMessages(history), { role: "user", content: userTurnContent(message, []) }],
    output_config: { format: { type: "json_schema", schema: GENERATION_RESPONSE_SCHEMA } },
  });
  const text = res.content.find((b) => b.type === "text");
  const result = validateGenerationResponse(JSON.parse(text!.text), library);
  history.push({ role: "user", content: message, photoCount: 0, seenIngredients: result.seenIngredients, at: "" });
  history.push({ role: "assistant", reply: result.reply, options: result.options, recipe: result.recipe, libraryMatches: result.libraryMatches, at: "" });
  console.log(`\n--- ${message}  (${((Date.now() - t0) / 1000).toFixed(1)}s, stop=${res.stop_reason}, cache_read=${res.usage.cache_read_input_tokens ?? 0}, cache_write=${res.usage.cache_creation_input_tokens ?? 0})`);
  console.log("reply:", result.reply);
  if (result.options) console.log("options:", result.options.map((o) => o.title));
  if (result.libraryMatches.length) console.log("matches:", result.libraryMatches.map((m) => `${m.title} — ${m.reason}`));
  if (result.recipe) console.log(`recipe: ${result.recipe.title} · ${result.recipe.ingredients.length} ingredients · ${result.recipe.instructions.length} steps · chol ${result.recipe.nutrition.cholesterol}mg · shoppingNames: ${result.recipe.ingredients.map((i) => i.shoppingName).join(", ")}`);
}
async function main() {
  await turn("I have chicken thighs and half a bag of rice, want something quick for tonight");
  const first = history[1];
  await turn(`Let's make: ${first.role === "assistant" && first.options ? first.options[0].title : "the first one"}`);
  await turn("Make it lower in cholesterol and serve 4");
}
main().catch((e) => { console.error(e); process.exit(1); });
