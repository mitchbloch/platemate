# Platemate — Product Requirements Document

## Problem
Every weekend, a couple plans 2-4 dinners + 1 slow cooker lunch prep, then grocery shops (primarily Trader Joe's). This is fully manual: searching NYT Cooking, TikTok, Instagram, Stealth Health for recipes, then building a grocery list by hand. One partner has high cholesterol, making nutritional awareness (especially cholesterol and saturated fat) a hard requirement.

## Solution
Platemate automates this workflow: curated recipe DB → AI-powered recipe import → health-aware weekly suggestions → store-grouped grocery list.

## Core Workflow
1. **Import** — Paste a recipe URL or freeform text (for video recipes) → AI extracts structured recipe + estimates nutrition
2. **Review** — Edit extracted fields, see cholesterol/sat fat flags, save to library
3. **Plan** — Get AI suggestions for the week → pick 3-4 dinners + slow cooker → assign days
4. **Shop** — Auto-generated grocery list grouped by store (TJ's default), checkable, shared

## Users
Two accounts (the couple). Shared data — no multi-tenancy needed.

## Health Requirements
- Per-serving nutrition estimates on every recipe (AI-powered, ~15% accuracy is fine)
- Cholesterol and saturated fat flags: warning (moderate) and danger (high) thresholds
- Weekly nutrition summary showing cumulative cholesterol/sat fat across planned meals
- Flag weeks where planned meals exceed recommended limits

## Non-Goals (Phase 1-3)
- Recipe creation from scratch (import-only for now)
- PWA / offline support (Phase 5)

## Phase 4: Grocery List — Design Decisions
- **Generation**: Auto-dedup + quantity merge from meal plan ingredients using TypeScript heuristics (not Claude API). Explicit "Generate List" button, not auto-generated on page load.
- **Categories**: 5 display categories — Protein (meat + seafood), Produce, Dairy, Snacks (manual-add only), Other (grains, canned, spices, condiments, etc.). Mapped from 11 `IngredientCategory` values.
- **Store tagging**: TJ's default, tag exceptions only — Target (preferred), HMart, Whole Foods.
- **Pinned items**: Staples (bananas, milk, yogurt) auto-added every week. Separate DB table from grocery list items.
- **Frequent suggestions**: Items appearing 3+ weeks get suggested for pinning.
- **Export**: Clipboard copy formatted for Apple Notes (checkbox format, grouped by category then store). Evaluated Apple Shortcuts URL scheme and Web Share API — clipboard has best friction-to-setup ratio for once-a-week use.
- **In-store UX**: Couple currently uses shared iCloud Note. Platemate generates the smart list, they paste into Notes. Transition path: PWA with real-time shared checking (Phase 5 for installability).
- **Real-time**: Supabase realtime subscriptions for shared item checking between both users.
- **Edit/Shop modes**: Two distinct modes — Edit (Sunday planning: dismiss items, change stores, add/remove) and Shop (in-store: checkboxes, copy to Notes). Solves checkbox ambiguity.
- **Pantry staples**: Persistent auto-exclude list for items always at home (salt, olive oil). Auto-dismissed on generation, restorable per-week when you run out. Separate from per-week dismiss which resets on regeneration.

## Phase 5: USDA Nutrition — Design Decisions
- **Source of truth**: USDA FoodData Central per-ingredient nutrition replaces Claude as the primary source. Claude continues to handle recipe extraction.
- **Matching strategy**: Claude (Haiku) maps each recipe ingredient to a curated canonical list of ~500–1000 ingredients pinned to specific USDA fdcIds. Avoids text-search ambiguity (cooked vs raw, fresh vs canned, "butter" vs "peanut butter") and encodes platemate defaults (e.g., "rice" → long-grain white, raw).
- **Hybrid fallback**: Per-ingredient. USDA where the canonical list matches; Claude (Sonnet) estimates only the contribution of ingredients that don't match. Preserves USDA accuracy for the matched portion.
- **Trigger**: New recipes get USDA at import. Existing recipes get a "Recompute Nutrition" button on RecipeDetail with explanatory copy + before/after diff + Revert button (legacy nutrition preserved in `nutrition_legacy` column).
- **Trust signal**: "USDA-verified" badge **only** when 100% of ingredients matched. Mixed recipes get no badge but expose match rate ("9 of 10 ingredients USDA-sourced") via tooltip — positive-only primary signaling.
- **Caching**: `ingredient_nutrition_cache` keyed by normalized name + unit basis with a 90-day TTL. Bounds staleness from USDA's periodic Foundation updates without manual refresh.
- **Canonical list audit**: Quarterly script pings each pinned fdcId for 404s and material name changes. SR Legacy fdcIds are frozen (2018 snapshot); Foundation drift is slow but real.
- **Unit conversion**: Volume → mass via density table (per-ingredient density on canonical entries when available). Count units ("1 large onion") via typical-weight table for ~30 common produce. "To taste" / "pinch" / unconvertible → unmatched (Claude estimates).
- **Sodium caveat**: USDA improves accuracy for quantified ingredients but does not solve un-quantified seasoning ("salt to taste"). Sodium remains the least precise nutrient regardless of strategy. Honest framing for the cholesterol-management use case.
- **Cost posture**: API cost increase is small (pennies/month at two-user scale). Prompt caching on the canonical list and Haiku for matching keep per-import cost in check; embedding pre-filter is a future optimization.

## Phase 5B: Smart Grocery Merge — Design Decisions
- **Foundation**: Builds on Phase 5's `canonical_ingredients` table by adding `shopping_group` and `shopping_category` fields. Two canonical entries with the same `shopping_group` merge for grocery purposes (e.g., "rice, white, raw" and "rice, white, cooked" share `shopping_group="rice (white)"` even though their nutrition entries are distinct).
- **Two identities**: Nutrition identity (per fdcId, fine-grained) and shopping identity (per shopping_group, coarse-grained) live in the same table but serve different purposes. Honest separation: cooked vs raw matters for nutrition, doesn't for shopping.
- **Pipeline**: Existing rule-based merger (`ingredientMerge.ts`, 57 tests) stays as Pass 1, unchanged. Pass 2 reconciles against the canonical list. Pass 3 is a single Haiku call for residuals (items rules and canonical lookup didn't cover) plus category cleanup for items currently in "Other".
- **Aggression**: Conservative. Merge only clearly-same shopping items. "Whole milk" + "2% milk" stay separate. "Canned tomatoes" + "fresh tomatoes" stay separate.
- **Determinism**: New `grocery_merge_decisions` table caches every pair decision (merge or separate). Same pair → same answer forever. Kills LLM non-determinism in steady state.
- **Trigger**: At grocery list generation, blocking. Adds ~2–3s; cache amortizes after 4–6 weeks of use.
- **UI**: Invisible improvement in v1, no new badge or trust signal. Edit-mode unchanged so users can manually override any merge.
- **Cost**: Single Haiku call per generation, mostly cache hits. ~$0.01–0.02 per generation max.

## Success Metrics
- Can import a recipe from any major cooking site in <10 seconds
- Video recipe links (TikTok, Instagram, YouTube) detected and gracefully redirected to text input
- Nutrition flags correctly identify high-cholesterol recipes
- Weekly planning takes <5 minutes (vs 30+ manual)
- Grocery list generation from meal plan in <2 seconds
- Clipboard export matches existing Apple Notes format (paste-ready)
- Grocery list is usable in-store on mobile
