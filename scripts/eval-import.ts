/**
 * Live drift check for recipe import: one real link per source, through the
 * same extraction code and time budget production uses — no web layer, no
 * auth. Platforms change without notice (TikTok's oEmbed lost captions
 * ~2026-10-19); this catches the next change before a user does.
 *
 *   npm run eval:import              extraction only (free, ~15s)
 *   npm run eval:import -- --parse   + the Claude call per source (a few cents)
 *
 * Exits 1 if any source doesn't behave as expected. Needs ANTHROPIC_API_KEY
 * in .env.local for --parse; BRAVE_SEARCH_API_KEY (optional) enables the
 * Instagram cross-post lookup. Runs from this machine: Vercel's datacenter
 * IPs may see more blocks — verify on a preview deployment too.
 */
import fs from "node:fs";
import path from "node:path";
import { EXTRACT_BUDGET_MS, IMPORT_BUDGET_MS, extractImportSource, type SectionLabel } from "../src/lib/import";
import { createDeadline, ImportFailure, subDeadline, type ImportFailureReason } from "../src/lib/import/fetchPage";
import { parseRecipe } from "../src/lib/recipeParser";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

type Outcome = "ok" | ImportFailureReason;

interface Case {
  label: string;
  url: string;
  /** Acceptable extraction outcomes */
  expect: Outcome[];
  /** Section labels a successful extraction must include */
  sections?: SectionLabel[];
  /** Acceptable outcomes of the Claude call (with --parse), default ["ok"] */
  parse?: Outcome[];
}

const hasBrave = Boolean(process.env.BRAVE_SEARCH_API_KEY);

const CASES: Case[] = [
  { label: "TikTok short link (user report)", url: "https://www.tiktok.com/t/ZPLPoL8uG/", expect: ["ok"], sections: ["CAPTION", "TRANSCRIPT"] },
  { label: "TikTok, steps only spoken", url: "https://www.tiktok.com/@wantmorerecipes/video/7582982195417976082", expect: ["ok"], sections: ["CAPTION", "TRANSCRIPT"] },
  { label: "YouTube Short", url: "https://youtube.com/shorts/8j5Z9IHEAj8", expect: ["ok"], sections: ["CAPTION"] },
  { label: "youtu.be", url: "https://youtu.be/8j5Z9IHEAj8", expect: ["ok"], sections: ["CAPTION"] },
  { label: "NYT Cooking", url: "https://cooking.nytimes.com/recipes/1017256-french-onion-soup", expect: ["ok"], sections: ["STRUCTURED DATA"] },
  { label: "BBC Good Food", url: "https://www.bbcgoodfood.com/recipes/easy-chocolate-cake", expect: ["ok"], sections: ["STRUCTURED DATA"] },
  { label: "Minimalist Baker (WPRM)", url: "https://minimalistbaker.com/1-pot-butternut-squash-quinoa-chili/", expect: ["ok"], sections: ["STRUCTURED DATA"] },
  { label: "Stealth Health paid post", url: "https://stealthhealthlife.substack.com/p/high-protein-chicken-tikka-masala", expect: ["ok"], sections: ["PAGE TEXT"], parse: ["no_recipe"] },
  // The hop is what's tested; this pin links to a 100-recipe roundup, which
  // correctly parses as no single recipe
  { label: "Pinterest pin → its site", url: "https://www.pinterest.com/pin/115334440443527182/", expect: ["ok", "blocked"], parse: ["ok", "no_recipe"] },
  { label: "Instagram reel", url: "https://www.instagram.com/reel/DCt9t_QSvOc/", expect: hasBrave ? ["ok", "blocked"] : ["blocked"] },
  // Cloudflare challenged these when we posed as Chrome; the honest UA passes
  { label: "Budget Bytes (Cloudflare)", url: "https://www.budgetbytes.com/baked-chicken-drumsticks/", expect: ["ok"], sections: ["STRUCTURED DATA"] },
  { label: "Half Baked Harvest (Cloudflare)", url: "https://www.halfbakedharvest.com/buffalo-chicken-tostada-stacks/", expect: ["ok"], sections: ["STRUCTURED DATA"] },
  { label: "Cookie and Kate (Cloudflare)", url: "https://cookieandkate.com/best-lentil-soup-recipe/", expect: ["ok"], sections: ["STRUCTURED DATA"] },
  { label: "Publisher block (402)", url: "https://www.allrecipes.com/recipe/16354/easy-meatloaf/", expect: ["blocked"] },
  { label: "Missing page", url: "https://www.budgetbytes.com/this-recipe-does-not-exist-platemate-eval/", expect: ["not_found"] },
];

const withParse = process.argv.includes("--parse");
if (withParse && !process.env.ANTHROPIC_API_KEY) {
  console.error("--parse needs ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

// Like production: a few imports at a time, not every Claude call at once
const CONCURRENCY = 3;

/** An ImportFailure's reason; any other error is reported, not thrown */
const outcomeOf = (err: unknown): string =>
  err instanceof ImportFailure ? err.reason : `error: ${err instanceof Error ? err.message : String(err)}`;

async function run(c: Case): Promise<boolean> {
  const t0 = Date.now();
  const deadline = createDeadline(IMPORT_BUDGET_MS);
  let problems: string[] = [];
  let line = "";

  try {
    const source = await extractImportSource(c.url, subDeadline(deadline, EXTRACT_BUDGET_MS));
    const labels = source.sections.map((s) => s.label);
    const missing = (c.sections ?? []).filter((l) => !labels.includes(l));
    if (!c.expect.includes("ok")) problems.push(`expected ${c.expect.join("|")}, got ok`);
    if (missing.length) problems.push(`missing ${missing.join(", ")}`);
    line = `ok ${source.sections.map((s) => `${s.label}=${s.text.length}`).join(" ")} · ${source.sourceName ?? "(no name)"}`;

    if (withParse) {
      const want = c.parse ?? ["ok"];
      try {
        const recipe = await parseRecipe(source, deadline);
        if (!want.includes("ok")) problems.push(`parse expected ${want.join("|")}, got a recipe`);
        line += `\n      → "${recipe.title}" · ${recipe.ingredients.length} ingredients · ${recipe.instructions.length} steps · chol ${recipe.nutrition.cholesterol}mg · ${recipe.sourceName}`;
      } catch (err) {
        const got = outcomeOf(err);
        if (!(want as string[]).includes(got)) problems.push(`parse expected ${want.join("|")}, got ${got}`);
        line += `\n      → ${got}`;
      }
    }
  } catch (err) {
    const got = outcomeOf(err);
    if (!(c.expect as string[]).includes(got)) problems.push(`expected ${c.expect.join("|")}, got ${got}`);
    line = `${got} (${err instanceof ImportFailure ? err.detail : ""})`;
  }

  const pass = problems.length === 0;
  console.log(`${pass ? "PASS" : "FAIL"}  ${c.label.padEnd(32)} ${String(Date.now() - t0).padStart(6)}ms  ${line}`);
  if (!pass) console.log(`      ✗ ${problems.join("; ")}`);
  problems = [];
  return pass;
}

async function main() {
  console.log(`Import drift check — ${new Date().toISOString()}${withParse ? " (with Claude)" : ""}${hasBrave ? "" : " (no Brave key: Instagram expects blocked)"}\n`);
  const results: boolean[] = [];
  const queue = [...CASES];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) results.push(await run(c));
    }),
  );
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${CASES.length - failed}/${CASES.length} sources behaving as expected`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
