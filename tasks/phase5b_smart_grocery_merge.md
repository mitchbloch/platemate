# Phase 5B: Smart Grocery List Merging (Claude-assisted)

> Depends on Phase 5 USDA Nutrition. Build only after the `canonical_ingredients` table from Phase 5 is in place.

## Goal
Improve grocery list quality by adding a Claude-assisted second pass on top of the existing rule-based merger. Combines semantically-equivalent ingredients ("Roma tomatoes" + "tomatoes" → tomatoes) and reassigns mis-categorized "Other" items to the correct display category. Conservative on aggression: only merge when clearly the same shopping item.

## Decisions Locked

| Decision | Choice | Why |
| --- | --- | --- |
| Foundation | Build on Phase 5 `canonical_ingredients`, with a new `shopping_group` field | Single source of truth for ingredient identity; auditable; curated alongside nutrition data |
| Shopping vs nutrition identity | Separate but related: `canonical_ingredients.shopping_group` lets cooked-rice and raw-rice share the same shopping identity while keeping distinct nutrition data | Resolves the "rice cooked vs uncooked" semantic split — nutrition cares, shopping doesn't |
| Pipeline | Rule-pass (existing `ingredientMerge.ts`) → Claude pass (only for items rules left separate) | Preserves 57 battle-tested rule-based cases; LLM augments rather than replaces |
| Trigger | Runs at grocery list generation time, blocking | Adds ~2–3s; what you see is final, no surprise UI shifts |
| Aggression | Conservative — merge only clearly-same items | "Roma tomatoes" + "tomatoes" merges. "Whole milk" + "2% milk" stays separate. "Canned tomatoes" + "fresh tomatoes" stays separate. |
| Scope | Merging **and** category reassignment for items the rule mapper sent to "Other" | Same Claude call handles both; marginal cost |
| Determinism | Cache merge-pair decisions in a `grocery_merge_decisions` table | Same pair → same answer forever; kills LLM non-determinism for the steady state |
| Routing | Haiku | Constrained classification task, doesn't need Sonnet |
| Prompt caching | Cache the canonical list + shopping_group mapping as the prompt prefix | Static context, ideal cache target |

## Architecture

```
generateGroceryList(mealPlan)
  ↓
Pass 1 — rule-based merge (existing ingredientMerge.ts, unchanged)
  → produces a list of MergedIngredient with current rule-based dedup
  ↓
Pass 2 — canonical-list reconciliation (new)
  ├─ For each item: look up canonical_ingredients by normalized name
  │   └─ If matched: tag with shopping_group + canonical category
  ├─ Group items by shopping_group
  │   └─ Merge within group (sum quantities, prefer canonical display name)
  └─ Items with no canonical match remain as-is
  ↓
Pass 3 — Claude judgment on residuals (new)
  ├─ Pairs of un-canonical items that *might* merge — surface to Claude:
  │   "Should 'fresh basil leaves' and 'basil' merge? They have no canonical match."
  ├─ Items currently in "Other" — surface to Claude:
  │   "What grocery category fits 'gochujang'? Choose from: produce/protein/dairy/snacks/other"
  ├─ Cache lookup first: for any pair already decided, skip Claude
  └─ Single batched Haiku call with prompt-cached canonical list as context
  ↓
Pass 4 — apply Claude decisions, write to cache
  ↓
Final grocery list with merged items + cleaner categorization
```

## Implementation Stages

### 5BA — Schema Extensions
- [ ] Migration `007_smart_grocery_merge.sql`:
  - Add `shopping_group` text column to `canonical_ingredients` (nullable initially)
  - Add `shopping_category` text column to `canonical_ingredients` (one of: protein/produce/dairy/snacks/other)
  - New `grocery_merge_decisions` table:
    - `id`, `item_a_normalized`, `item_b_normalized` (always sorted alphabetically — symmetric key), `decision` (merge | separate), `merged_name` (nullable, used when decision=merge), `decided_at`
    - Unique index on `(item_a_normalized, item_b_normalized)`
- [ ] Types: extend `CanonicalIngredient` with `shoppingGroup`, `shoppingCategory`. Add `MergeDecision` interface.

### 5BB — Seed shopping_group on Canonical List
- [ ] Bootstrap script extends the Phase 5 canonical curation:
  - For each canonical entry, set `shopping_group` (e.g., "rice (white)", "tomatoes (fresh)", "olive oil")
  - Set `shopping_category` (the display category override for this item)
  - Multiple canonical entries can share a shopping_group ("rice, white, raw" + "rice, white, cooked" → both shopping_group = "rice (white)")
- [ ] Document in `tasks/canonical_ingredients_curation.md` that `shopping_group` is curator-driven (not LLM-derived) — these are product decisions about how the user shops

### 5BC — Pass 2: Canonical Reconciliation
- [ ] `src/lib/canonicalGroceryReconcile.ts`:
  - `reconcileWithCanonical(items: MergedIngredient[]): { reconciled, unmatched }`
  - Look up canonical_ingredients by normalized item name
  - For matched items: group by shopping_group, sum quantities (with unit normalization), use canonical display name
  - Return reconciled list + list of unmatched items for Claude pass
- [ ] Vitest tests: same shopping_group merges, different shopping_groups stay separate, unit summing within group, unmatched items pass through

### 5BD — Pass 3: Claude Judgment + Cache
- [ ] `src/lib/groceryClaudePass.ts`:
  - `claudeMergeAndCategorize(unmatched, otherCategoryItems): Promise<{ merges, categorizations }>`
  - For pairs in unmatched: check `grocery_merge_decisions` cache first; only ask Claude about uncached pairs
  - Single batched Haiku call: input = unmatched pair candidates + Other-category items + cached canonical list as context
  - Output JSON schema: `{ merges: [{a, b, mergedName}], categorizations: [{name, category}] }`
  - Strict prompt: "Be conservative. Only merge if clearly the same shopping item. Different cooking states (canned vs fresh, whole vs reduced-fat) stay separate."
  - Write all decisions (merge AND separate) to cache so future generations skip Claude entirely
- [ ] Vitest tests with mocked Claude: merge decisions written to cache, cache hits skip Claude, malformed JSON falls back to rule-only result, conservative behavior verified

### 5BE — Wire Into Generation
- [ ] Update `src/lib/groceryList.ts` `generateGroceryList`:
  - After existing `mergeIngredients` rule pass, call `reconcileWithCanonical`
  - Then call `claudeMergeAndCategorize` on residuals
  - Apply results, return final list
- [ ] Add timing log: `[grocery] rule pass: Xms, canonical: Yms, claude: Zms (cache hits: A/B)`
- [ ] Graceful degradation: if Claude pass throws or times out, return reconciled list from passes 1+2 only

### 5BF — UI Surfacing (Light Touch)
- [ ] No new badge or trust signal in v1 — merging is invisible improvement, not a feature to advertise
- [ ] Optional: small "i" tooltip on grocery list header showing "Last generated in Xs · N items merged" for trust during rollout
- [ ] Edit-mode UI unchanged — users can still manually un-merge, recategorize, etc.

### 5BG — Polish & Verification
- [ ] `npm run build` + `npm run lint` + `npm run test` clean
- [ ] Cache audit: log cache hit rate per generation; expect >80% after 4–6 weeks of use
- [ ] Manual verification:
  - Plan a week with intentionally-mergeable items (Roma tomatoes + grape tomatoes + fresh basil + basil leaves) → verify they merge with sane display names
  - Plan a week with intentionally-separate items (whole milk + 2% milk + canned tomatoes + fresh tomatoes) → verify they stay separate
  - Plan a week with novel ingredients (gochujang, za'atar, tahini) → verify Claude assigns sensible categories instead of dumping in Other
  - Check `grocery_merge_decisions` table fills up over a few weeks of use
  - Compare generation latency before/after — should be <3s slower in steady state thanks to cache

## Risks & Open Questions

| Risk | Mitigation |
| --- | --- |
| Claude over-merges (combines distinct items the user wanted separate) | Conservative system prompt; cache writes both merge AND separate decisions so a one-off mistake can be manually overridden in the cache; edit-mode lets users un-merge in the UI |
| Claude under-merges (misses obvious merges) | Curated canonical list catches the common case (~80% of items); Claude only handles the long tail; conservative bias is correct here — false separations are easier to fix than false merges |
| Non-determinism causing list variation week to week | `grocery_merge_decisions` cache makes pair decisions permanent; same pair → same answer forever |
| User disagrees with a cached decision | Need an admin path: simple SQL update or a dev-only UI to edit cache entries. Real users won't hit this often. |
| `shopping_group` curation drift (canonical list grows but shopping groups not maintained) | Audit script (Phase 5G) extends to flag canonical entries with NULL shopping_group; quarterly review |
| Claude's category cleanup picks the wrong bucket for ambiguous items (e.g., is "tahini" condiment or other?) | Constrained output to existing 5 categories; user can manually recategorize in edit mode; cache the decision so it doesn't recur |
| Adds 2–3s to every grocery list generation | Acceptable for once-a-week use; logged so we can see it; cache amortizes after warm-up |
| Claude API cost | Single Haiku call per generation, mostly cache hits. ~$0.01–0.02 per generation max. Trivial. |
| Latency when cache is cold (first few weeks) | Acceptable; users see improvement compounding rather than degradation |

## Dependency on Phase 5

This phase **requires Phase 5 USDA Nutrition to be in place first** — specifically:
- `canonical_ingredients` table with rows for the top ~500 ingredients
- The bootstrap process for canonical curation
- Claude API client wrapper with model routing (Haiku/Sonnet)

If Phase 5 ships, Phase 5B can ship 1–2 weeks later. Most of the heavy lifting (the canonical list itself) is already done; Phase 5B adds two columns + reconciliation logic on top.

## Out of Scope
- A "merge confidence" UI showing why items were merged
- User-facing override of a cached merge decision (workaround: edit in UI, that doesn't write back to cache)
- New display categories beyond the existing 5 (Protein, Produce, Dairy, Snacks, Other)
- Cross-recipe quantity reconciliation more sophisticated than the existing unit normalization
- Per-household merge preferences (treat all platemate users the same for now)
- Changing the rule-based merger; it stays as Pass 1 unchanged
