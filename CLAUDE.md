# Platemate

## What is this?
Weekly meal planning & grocery list tool for a couple. AI-powered recipe import from URLs, nutrition-aware (cholesterol/sat fat flagging), store-grouped grocery lists.

## Tech Stack
- Next.js 16 + App Router + TypeScript (strict)
- Tailwind v4 (no component library)
- Supabase (Postgres + Auth + RLS)
- Claude API (recipe extraction + nutrition estimation)
- Vercel (hosting, auto-deploy on push)

## Architecture
- **Hybrid**: Pure TypeScript modules in `src/lib/`, thin App Router UI on top
- **Server components** by default (read-heavy pages)
- **Client components** only when needed (`"use client"` for forms, auth state, interactive planner)
- **JSONB ingredients** in recipes table (no normalization until Phase 4)
- **Single Claude API call** per recipe import (extraction + nutrition + per-ingredient `shoppingName` in one pass)
- **Grocery merge key is `shoppingName`** (brand-agnostic, "what you'd write on a paper list"); falls back to the ingredient name for recipes imported before Phase 8C. One-time backfill: `npm run backfill:shopping-names` (needs the service-role key in a git-ignored env file — see the script header)
- **Dual input mode**: URL scraping for recipe sites, freeform text for video/non-scrapable sources
- **Video auto-extraction**: TikTok (oEmbed), YouTube (oEmbed + meta tags), Instagram (Brave Search cross-post lookup)
- **Graceful degradation**: auto-extract → manual text paste fallback for all video platforms
- **Unordered meal sets**: weekly planner uses sets (not day-assigned grids) — matches actual workflow
- **Weeks start Sunday**: grocery shopping + first cook is Sunday
- **Optimistic UI**: meal add/remove updates state immediately, reverts on API failure

## Conventions
- `@/*` path alias for `src/`
- snake_case in DB, camelCase in TypeScript (DAL handles conversion)
- Utility functions, not classes
- Tailwind v4 with `@theme inline` for custom colors

## Key Files
- `src/lib/types.ts` — All domain types, nutrition thresholds
- `src/lib/recipeParser.ts` — URL → HTML → Claude → ParsedRecipe (also text → Claude for video recipes)
- `src/lib/nutrition.ts` — Health flags, weekly summaries
- `src/lib/recipes.ts` — Supabase CRUD (snake_case ↔ camelCase conversion)
- `src/lib/mealPlans.ts` — Meal plan DAL (CRUD, getWeekStart, joined recipe queries)
- `src/lib/recipeHistory.ts` — Recipe history DAL (idempotent batch logging, last-cooked dates)
- `src/lib/recommendations.ts` — Suggestion engine (recency scoring + cuisine variety penalty)
- `src/lib/ingredientMerge.ts` — Ingredient normalization, dedup, quantity merging (Phase 4); keys on `shoppingName` (Phase 8C)
- `src/lib/shoppingName.ts` — Shopping-name prompt rules + normalizer shared by the parser and the backfill script
- `src/lib/categoryMap.ts` — IngredientCategory → GroceryDisplayCategory mapping (Phase 4)
- `src/lib/groceryList.ts` — Grocery list DAL (generate, save, CRUD) (Phase 4)
- `src/lib/groceryExport.ts` — Clipboard export formatter for Apple Notes (Phase 4)
- `src/lib/pinnedItems.ts` — Pinned grocery staples DAL (Phase 4)
- `src/lib/pantryItems.ts` — Pantry staples DAL: auto-exclude items you always have (Phase 4)
- `src/lib/recipeShares.ts` — Share links DAL: one active token per (recipe, sharer), public read via RPC, view/save counts (Phase 8D)
- `src/lib/navigation.ts` — Same-origin `next`/`from` path validation for deep links
- `src/lib/supabase/` — Client (browser), server, middleware, auth helpers
- `src/components/RecipeDetail.tsx` — Recipe view/edit/delete (client component)
- `src/components/RecipeForm.tsx` — Recipe import flow (URL or text → parse → review → save)
- `src/components/WeeklyPlanner.tsx` — Meal planner (week nav, picker with filters, suggestions, optimistic add/remove)
- `src/components/WeeklyNutritionSummary.tsx` — Aggregated weekly nutrition with color-coded flags
- `supabase/migrations/` — DB schema (001 initial … 015 servings check, 016 recipe shares)

## Auth
- Self-service sign-up; users belong to households (multi-household since migration 009)
- Data isolation via RLS: every data table is scoped by `household_id IN (SELECT user_household_ids())`
- Joining a household goes through the `join_household_by_code` SECURITY DEFINER RPC (migration 014) — membership inserts are otherwise admin-only
- Middleware redirects unauthenticated page requests to `/login?next=<path>`; API requests get 401 JSON. `/r/<token>` (shared recipes) is public: the page reads through the anon-callable `get_shared_recipe` RPC (migration 016); saving a copy goes through the authenticated `/api/share/[token]/save`

## Phases
1. **Foundation** — Scaffolding, auth, navigation, DB schema ✅
2. **Recipe Management** — Import, parse, CRUD, library UI ✅
3. **Meal Planning** — Weekly planner, smart suggestions, nutrition summary, history tracking ✅
4. **Grocery List** — Dedup, store tagging, real-time shared list, Edit/Shop modes, pantry staples ✅
5. **Polish & Growth** — iOS/mobile, multi-household support, sign-up + onboarding, PWA, ratings
8. **Mobile QoL + Share/Search/Staples/Generation** — see `tasks/phase8_qol_and_features.md` (in progress)

## Commands
```bash
npm run dev    # Start dev server
npm run build  # Production build
npm run lint   # ESLint
```

## Deployment
- **Vercel**: https://platemate-psi.vercel.app
- Auto-deploys on push to main via GitHub integration
- Env vars set in Vercel dashboard (Supabase URL, anon key, Anthropic API key)

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://qsqehytthikcmiudbubs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set in .env.local + Vercel>
ANTHROPIC_API_KEY=<set in .env.local + Vercel>
BRAVE_SEARCH_API_KEY=<optional, set in .env.local + Vercel>
```
Supabase project ID: `qsqehytthikcmiudbubs`
