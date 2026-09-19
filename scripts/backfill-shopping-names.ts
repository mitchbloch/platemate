/**
 * One-time backfill: give every ingredient on every recipe a brand-agnostic
 * `shoppingName` (the grocery-merge key introduced in Phase 8C).
 *
 * Run from platemate/:   npm run backfill:shopping-names -- [--dry-run] [--limit N]
 *
 * Needs, in git-ignored env files (never committed, never printed):
 *   .env.local            NEXT_PUBLIC_SUPABASE_URL, ANTHROPIC_API_KEY
 *   .env.backfill.local   SUPABASE_SERVICE_ROLE_KEY   (bypasses RLS: covers every household)
 *
 * Idempotent: only recipes with at least one ingredient missing `shoppingName`
 * are sent to Claude; re-running touches nothing that is already filled.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { SHOPPING_NAME_RULES, normalizeShoppingName } from "../src/lib/shoppingName";
import type { Ingredient } from "../src/lib/types";

// ── Config ──

const MODEL = "claude-haiku-4-5";
const BATCH_SIZE = 20;

function loadEnvFile(name: string): void {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env.backfill.local");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} — see the header comment for which file it belongs in.`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

// ── Claude call ──

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recipes"],
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "shoppingNames"],
        properties: {
          id: { type: "string" },
          shoppingNames: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You assign grocery shopping names to recipe ingredients.

${SHOPPING_NAME_RULES}

You receive several recipes, each with an id and a numbered ingredient list. Return, for every recipe id, a "shoppingNames" array with exactly one entry per ingredient, in the same order.`;

interface RecipeRow {
  id: string;
  title: string;
  ingredients: Ingredient[];
}

async function assignShoppingNames(batch: RecipeRow[]): Promise<Map<string, string[]>> {
  const userMessage = batch
    .map(
      (r) =>
        `Recipe id: ${r.id}\nTitle: ${r.title}\n${r.ingredients
          .map((ing, i) => `${i + 1}. ${ing.raw || ing.name} [name: ${ing.name}]`)
          .join("\n")}`,
    )
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    messages: [{ role: "user", content: userMessage }],
  });
  if (message.stop_reason !== "end_turn") {
    throw new Error(`Unexpected stop_reason ${message.stop_reason}`);
  }
  const text = message.content.find((b) => b.type === "text");
  if (!text) throw new Error("No text block in response");
  const parsed = JSON.parse(text.text) as { recipes: { id: string; shoppingNames: string[] }[] };
  return new Map(parsed.recipes.map((r) => [r.id, r.shoppingNames]));
}

// ── Main ──

async function main() {
  const { data, error } = await supabase.from("recipes").select("id, title, ingredients").order("created_at");
  if (error) throw error;

  const all = (data ?? []) as RecipeRow[];
  const pending = all.filter((r) => r.ingredients.some((ing) => ing.shoppingName === undefined || ing.shoppingName === null)).slice(0, limit);
  console.log(`${all.length} recipes total, ${pending.length} need shopping names${dryRun ? " (dry run)" : ""}`);
  if (pending.length === 0) return;

  let updated = 0;
  let skipped = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const names = await assignShoppingNames(batch);

    for (const r of batch) {
      let assigned = names.get(r.id);
      if (!assigned || assigned.length !== r.ingredients.length) {
        // Long lists occasionally come back one short in a batch; a solo
        // call for that recipe almost always lines up.
        assigned = (await assignShoppingNames([r])).get(r.id);
      }
      if (!assigned || assigned.length !== r.ingredients.length) {
        console.warn(`  skip ${r.id} "${r.title}": got ${assigned?.length ?? 0} names for ${r.ingredients.length} ingredients`);
        skipped += 1;
        continue;
      }
      const ingredients = r.ingredients.map((ing, idx) => ({
        ...ing,
        // Never overwrite a name that is already set (idempotence). An empty
        // answer stays null: the merge then falls back to the ingredient name
        // without claiming canonical precedence over other recipes' names.
        shoppingName: ing.shoppingName ?? normalizeShoppingName(assigned[idx]),
      }));

      if (dryRun) {
        console.log(`  ${r.title}`);
        for (const ing of ingredients) if (ing.shoppingName !== ing.name.toLowerCase()) console.log(`      ${ing.name}  →  ${ing.shoppingName ?? "(none)"}`);
        continue;
      }
      const { error: updateError } = await supabase.from("recipes").update({ ingredients }).eq("id", r.id);
      if (updateError) {
        console.warn(`  failed ${r.id}: ${updateError.message}`);
        skipped += 1;
        continue;
      }
      updated += 1;
    }
    console.log(`batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} done`);
  }
  console.log(`updated ${updated}, skipped ${skipped}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
