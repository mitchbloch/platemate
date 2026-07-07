# Phase 5: USDA Nutrition Integration

## Goal
Replace Claude-estimated nutrition with USDA FoodData Central (FDC) per-ingredient lookups, using **Claude as the matcher** against a curated canonical ingredient list pinned to specific USDA fdcIds. Claude continues to handle recipe extraction. Existing recipes get a manual "Recompute" button; new recipes get USDA at import time.

## Decisions Locked

| Decision | Choice | Why |
| --- | --- | --- |
| Source of nutrition data | USDA FoodData Central (Foundation + SR Legacy) | Empirically lab-measured; auditable provenance for cholesterol/sodium decisions |
| Matching strategy | **Claude maps ingredients → curated canonical list** (not text search) | Claude understands "uncooked rice" vs "cooked rice", "fresh tomato" vs "canned tomato sauce" — text search doesn't |
| Canonical list | Curated ~500–1000 ingredients, each pinned to a specific USDA fdcId | Avoids matching ambiguity; encodes platemate-specific defaults ("rice" → long-grain white, raw); auditable |
| Fallback | Per-ingredient hybrid: Claude estimates only the ingredients that don't match the canonical list | Most recipes have 8–9 canonical-clean ingredients + 1–2 fuzzy ones; preserves USDA accuracy for the matched portion |
| When | New recipes: at import. Existing recipes: manual "Recompute" button with explanatory copy | Avoid expensive batch backfill; opt-in upgrade path |
| Trust badge | "USDA-verified" badge **only** when 100% of ingredients matched the canonical list | Positive-only signaling; partial-USDA recipes don't carry an over-confident badge |
| Match-rate tooltip | Mixed recipes show "9 of 10 ingredients USDA-sourced" on hover/tap | User can sanity-check why a recipe isn't badged without exposing the messy state as a primary signal |
| Legacy rollback | Keep `nutrition_legacy` jsonb column on recipes for one-click rollback after Recompute | Recompute is irreversible otherwise; a worse-looking number with no undo erodes trust |
| Caching | New `ingredient_nutrition_cache` table keyed by normalized name + unit basis. TTL 90 days. | USDA updates Foundation values periodically; bounded staleness without manual refresh |
| Canonical list audit | Quarterly script pings each pinned fdcId, flags 404s and material name changes | SR Legacy fdcIds are stable but Foundation entries can be reclassified; ~5min human review per quarter |
| Routing | Sonnet for extraction. **Haiku for ingredient matching** (picking from candidates). | Matching is a constrained classification task; Haiku is 5× cheaper and capable enough |
| Prompt caching | Canonical list (~10k tokens) sent as cached prefix on every matching call | Static context, ideal cache target; after warm-up the canonical list cost is ~10% of fresh tokens |

## Architecture

```
Recipe import (URL or text)
  ↓
Claude extraction (Sonnet) → recipe + structured ingredients (no nutrition)
  ↓
NEW: ingredientNutrition.computeRecipeNutrition(ingredients, servings)
  │
  ├─ Cache lookup per ingredient (normalized name + unit)
  │   └─ Hit (within 90-day TTL) → use cached fdcId + nutrition
  │
  ├─ Misses → batched Claude matching call (Haiku)
  │   ├─ Input: list of unmatched ingredients + cached canonical list (prompt cache)
  │   ├─ Output: { ingredient: fdcId | null }
  │   └─ For each match: fetch nutrition from FDC `/food/{fdcId}`, write to cache
  │
  ├─ For each matched ingredient:
  │   ├─ Convert quantity + unit → grams (unitConversion.ts)
  │   └─ Compute contribution: (grams / 100) * usdaFood.per100g
  │
  ├─ For unmatched ingredients (Claude returned null OR unit unconvertible):
  │   └─ Single Claude call (Sonnet) — "Estimate per-serving contribution of these ingredients"
  │
  ├─ Sum + divide by servings → NutritionInfo
  └─ Return { nutrition, source, matchedCount, totalCount }
        source = "usda" if matchedCount === totalCount
                 "mixed" if 0 < matchedCount < totalCount
                 "estimated" if matchedCount === 0
  ↓
Save recipe with nutrition + nutrition_source + nutrition_legacy (preserves prior values)
```

## API Key (manual user step — do first)

1. Sign up at https://fdc.nal.usda.gov/api-key-signup.html (free, instant)
2. Add `FDC_API_KEY=<key>` to `.env.local`
3. Add `FDC_API_KEY` to Vercel project env vars (Production + Preview + Development)
4. Update `CLAUDE.md` env-vars section to list `FDC_API_KEY`

## Implementation Stages

### 5A — Foundation
- [ ] User: get FDC API key, add to `.env.local` + Vercel
- [ ] Migration `006_usda_nutrition.sql`:
  - `ingredient_nutrition_cache` table: `id`, `normalized_name`, `unit_basis` (per_100g | per_unit), `usda_fdc_id`, `usda_food_name`, `nutrition` (jsonb), `cached_at` timestamp. Unique index on `(normalized_name, unit_basis)`.
  - `canonical_ingredients` table: `id`, `canonical_name`, `aliases` (text[]), `usda_fdc_id`, `usda_food_name`, `default_unit_basis`, `shopping_group` (nullable, used by Phase 5B grocery merge), `shopping_category` (nullable, used by Phase 5B grocery merge), `notes`, `last_audited_at`. This is the curated list — manually edited. (Note: `shopping_group` and `shopping_category` are seeded for Phase 5 ingredients but only consumed by Phase 5B.)
  - Add `nutrition_source` column to `recipes`: text, default `'estimated'`, check in (`'usda'`, `'mixed'`, `'estimated'`)
  - Add `nutrition_match_rate` column to `recipes`: text, e.g. "9/10" — for tooltip, nullable
  - Add `nutrition_legacy` jsonb column to `recipes`: nullable, stores prior nutrition before recompute
  - Backfill existing recipes: `nutrition_source = 'estimated'`
- [ ] Types: `NutritionSource = "usda" | "mixed" | "estimated"`. Add `IngredientNutritionCacheEntry`, `CanonicalIngredient` interfaces.
- [ ] `src/lib/usdaClient.ts`:
  - `getFood(fdcId: number): Promise<UsdaFood>` — `/food/{fdcId}` for nutrient detail
  - Maps USDA nutrient IDs → `NutritionInfo` (calories=1008, protein=1003, fat=1004, carbs=1005, fiber=1079, sat fat=1258, cholesterol=1253, sodium=1093)
  - No search method — we don't text-search anymore; matching is Claude-mediated

### 5A.5 — Canonical Ingredient List Bootstrap
- [ ] Pull existing recipe ingredients from Supabase, frequency-rank
- [ ] For top ~50 ingredients: manually verify USDA match (search FDC, pick the right Foundation/SR Legacy entry, record fdcId), set `shopping_group` and `shopping_category` for each (e.g., raw rice and cooked rice both get `shopping_group="rice (white)"`, `shopping_category="other"`)
- [ ] For next ~200 ingredients: Claude-drafted mapping from a one-off script that calls Claude with batched ingredient names + FDC search results, record fdcIds + Claude-suggested shopping_group/shopping_category; spot-check a sample
- [ ] Seed `canonical_ingredients` table from this data
- [ ] Document the curation process in `tasks/canonical_ingredients_curation.md` so future additions follow the same path

### 5B — Unit Conversion
- [ ] `src/lib/unitConversion.ts`:
  - `toGrams(quantity: number, unit: string, ingredientName?: string, density?: number): number | null`
  - Volume → grams via density table (water baseline, oils, dairy, flours)
  - Mass: oz, lb → grams (exact)
  - Count units ("1 large onion") → typical-weight table for ~30 common produce
  - Returns `null` for "to taste", "pinch", "splash", "drizzle"
  - Density is read from the canonical list when available (more accurate than generic table)
- [ ] Vitest tests: cup/tbsp/tsp/oz/lb, count units, unparseable units, density override

### 5C — Claude-Mediated Matching
- [ ] `src/lib/ingredientMatcher.ts`:
  - `matchIngredientsToCanonical(ingredients, canonicalList): Promise<Map<ingredientId, fdcId | null>>`
  - Single Haiku call with prompt-cached canonical list as context
  - Prompt enforces strict JSON output schema
  - Tight system prompt: "Map each ingredient to a canonical fdcId or null. Consider cooking state (raw vs cooked), preparation (fresh vs canned), and quantity context."
  - Use `cache_control: { type: "ephemeral" }` on the canonical list portion of the prompt
- [ ] Claude API client wrapper: `src/lib/claudeClient.ts` if not already present, with model parameter (sonnet for extraction, haiku for matching)
- [ ] Vitest tests with mocked Claude responses: full match, partial match, no match, malformed response handling

### 5D — Per-Recipe Aggregation
- [ ] `src/lib/ingredientNutrition.ts`:
  - `computeRecipeNutrition(ingredients, servings) → { nutrition, source, matchedCount, totalCount }`
  - Cache check → Claude matching for misses → unit conversion → per-100g math → sum
  - For unmatched: one batched Sonnet call estimating their combined contribution
  - Returns aggregated `NutritionInfo` plus source + match counts
- [ ] Vitest tests: full-USDA path, mixed path, all-fail path, cache-hit path, TTL-expired-cache path

### 5E — Import Flow Integration
- [ ] Update `recipeParser.ts`:
  - Drop `nutrition` field from Claude extraction system prompts (HTML + text variants)
  - Update `ParsedRecipe` validation: nutrition no longer expected from Claude
- [ ] Update `/api/recipes/parse` and `/api/recipes/parse-text`:
  - After parse, call `computeRecipeNutrition(parsed.ingredients, parsed.servings)`
  - Attach nutrition + nutrition_source + match rate to response
- [ ] `RecipeForm.tsx`: add "Looking up nutrition (USDA)…" stage to import spinner messages

### 5F — Recompute UI
- [ ] `POST /api/recipes/[id]/recompute-nutrition`:
  - Reads recipe.ingredients, recomputes nutrition
  - Writes new nutrition + nutrition_source + match rate
  - Saves prior values to `nutrition_legacy` (overwrites previous legacy if present)
- [ ] `POST /api/recipes/[id]/restore-nutrition` — if `nutrition_legacy` is non-null, restore it and clear legacy
- [ ] `RecipeDetail.tsx`:
  - "Recompute Nutrition" button (secondary style) below nutrition section
  - Helper text near button:
    > Recompute pulls each ingredient from USDA's official food database for more accurate nutrition than the original AI estimate. Takes ~5–10s.
  - Loading state during recompute
  - On completion: show before/after nutrition diff with "Keep new" / "Revert" actions
  - "USDA-verified" badge component (small green pill) — render only when `nutrition_source === "usda"`
  - Match-rate tooltip on the recipe header showing "9 of 10 ingredients USDA-sourced" when source is "mixed"
- [ ] `MealCard` in `WeeklyPlanner.tsx`: render the same USDA-verified badge

### 5G — Polish & Verification
- [ ] Cache hit-rate counter (log line in ingredientMatcher: `[usda] match cache hit rate: X/Y`)
- [ ] Audit script `scripts/audit_canonical_ingredients.ts`:
  - Iterates `canonical_ingredients`, calls FDC `/food/{fdcId}` for each
  - Flags 404s and material name changes (Levenshtein > threshold vs stored `usda_food_name`)
  - Outputs report; updates `last_audited_at` for clean entries
  - Run quarterly (manual cron / calendar reminder)
- [ ] Cache TTL refresh: when reading from `ingredient_nutrition_cache`, if `cached_at` > 90d ago, treat as miss and refresh from FDC
- [ ] `npm run build` + `npm run lint` + `npm run test` clean
- [ ] Manual verification on deploy:
  - Import a recipe with all-canonical ingredients (e.g., simple chicken & rice) → expect "USDA-verified" badge
  - Import a recipe with one fuzzy ingredient ("homemade chimichurri") → expect no badge, match-rate tooltip shows N-1 of N
  - Recompute an existing pre-USDA recipe → values change, before/after diff shown, badge appears if all matched, Revert restores prior nutrition
  - Sanity-check 1–2 recipes' USDA numbers against a reference (USDA online lookup, MyFitnessPal, etc.)

## Risks & Open Questions

| Risk | Mitigation |
| --- | --- |
| Claude matches an ingredient incorrectly (e.g., "rice" → cooked instead of raw) | Curated canonical list pins specific fdcIds with platemate defaults; matching prompt explicitly asks Claude to consider cooking state. Audit log of mappings makes errors visible. |
| Curated list staleness (better USDA entry exists) | Quarterly audit script + 90-day TTL on cached nutrition values. SR Legacy fdcIds are frozen; Foundation drift is slow. |
| Unit ambiguity ("1 onion", "to taste") | Typical-weight table for ~30 produce items + density data on canonical entries; "to taste" / "pinch" / unconvertible → Claude estimates that ingredient |
| Recompute produces worse-looking numbers, no undo | `nutrition_legacy` column + before/after diff in UI + Revert button |
| Mixed recipes (9/10 vs 2/10 matched) look identical without a badge | Match-rate tooltip exposes the count without making it a primary signal |
| Salt-to-taste sodium under-reporting | **Surfaced explicitly in PRD**: USDA improves accuracy on quantified ingredients; un-quantified seasoning ("salt to taste") still relies on Claude estimation. Sodium remains the least precise nutrient regardless of strategy. |
| Claude API costs increase | Pennies/month at this scale. Mitigations: prompt caching on canonical list, Haiku for matching calls, embedding pre-filter as a future optimization if needed. |
| FDC rate limit (1000/hr/key) | Per-ingredient cache; per-recipe USDA fetches scale with cache misses, not imports. After warm-up should be a non-issue. |
| Claude returns malformed JSON for matching | Strict schema in prompt + JSON mode; on parse failure, treat all ingredients as unmatched and fall back to Sonnet estimation |
| Migration on existing recipes | Default `nutrition_source='estimated'`. Recompute is opt-in; legacy fallback protects against bad recomputes. |

## Out of Scope (this phase)
- Bulk auto-backfill of all existing recipes (manual Recompute only)
- Embedding-based pre-filter for matching (future optimization once volume justifies)
- Per-ingredient manual override UI ("this 'chicken' should map to fdcId X")
- Branded-product matching with UPC
- Expanding `NutritionInfo` fields beyond current set
- Smart grocery-list merging via Claude (covered in separate phase, see `phase5b_smart_grocery_merge.md` if/when scoped)
