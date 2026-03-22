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

## Success Metrics
- Can import a recipe from any major cooking site in <10 seconds
- Video recipe links (TikTok, Instagram, YouTube) detected and gracefully redirected to text input
- Nutrition flags correctly identify high-cholesterol recipes
- Weekly planning takes <5 minutes (vs 30+ manual)
- Grocery list generation from meal plan in <2 seconds
- Clipboard export matches existing Apple Notes format (paste-ready)
- Grocery list is usable in-store on mobile
