# Platemate — Implementation Tracker

## Phase 1: Foundation ✅
- [x] Project scaffolding, type definitions, Supabase client setup
- [x] Auth (login, middleware, useAuth hook)
- [x] Navigation + shell pages for all routes
- [x] Database migration, GitHub repo, build/lint passing
- [x] Vercel deployment (https://platemate-psi.vercel.app)

## Phase 2: Recipe Management ✅
- [x] Recipe parser (URL → HTML → Claude → structured recipe + nutrition)
- [x] Recipe CRUD (DAL + API routes: GET/POST/PATCH/DELETE)
- [x] Recipe import UI (paste URL → review/edit → save)
- [x] Recipe library with nutrition badges (cholesterol/sat fat/sodium flags)
- [x] Recipe detail with inline edit + delete (confirmation step)
- [x] Consolidated prep/cook time into single total_time_minutes
- [x] Verified: imported shrimp tacos, cholesterol flagged red, edited time, saved

## Phase 2.5: Recipe Import Improvements
- [x] Video URL detection (TikTok, Instagram, YouTube) with early 422 return
- [x] Manual text input mode (paste recipe text from video captions, notes, etc.)
- [x] Dual input toggle in RecipeForm (Paste URL / Paste Text)
- [x] Auto-switch to text mode when video URL detected, with amber info banner
- [x] Separate /api/recipes/parse-text endpoint
- [x] Refactored shared Claude call logic (DRY: callClaudeForRecipe helper)
- [x] TikTok auto-extraction via oEmbed API (full caption with recipe)
- [x] YouTube auto-extraction via oEmbed title + HTML og:description
- [x] Instagram cross-post search via Brave Search API (finds TikTok/YouTube reposts)
- [x] Graceful degradation: auto-extract → manual text paste fallback
- [x] Video-aware spinner messages in RecipeForm
- [x] Build + lint passing

## Phase 3: Meal Planning
- [x] Meal plan DAL (`src/lib/mealPlans.ts`) — CRUD, getWeekStart, getMealPlanWithRecipes (joined query)
- [x] Recipe history DAL (`src/lib/recipeHistory.ts`) — logCookedRecipes (idempotent), getLastCookedDates
- [x] Recommendation engine (`src/lib/recommendations.ts`) — recency scoring + cuisine variety penalty
- [x] API routes: GET/POST meal-plans, POST add recipe (auto-creates plan), DELETE remove, POST complete (log history), GET recipe-history
- [x] WeeklyNutritionSummary component — reuses `weeklyNutritionSummary()`, color-coded flags
- [x] WeeklyPlanner component — week navigation, meal cards grouped by type, recipe picker with cuisine/type filters, suggestion banner, optimistic add/remove
- [x] Plan page server component — parallel data fetch, passes to WeeklyPlanner
- [x] Auto-log with override: incomplete week banner prompts to confirm which meals were cooked
- [x] Build + lint passing
- [ ] Live verification: test full flow on deployed app

## Phase 4: Grocery List
- [ ] Ingredient deduplication + quantity merging
- [ ] Store tagging (TJ's default, exceptions for WF/HMart/Target)
- [ ] Checkable list grouped by store, then by category
- [ ] Mobile-optimized view
- [ ] Supabase real-time for shared checking

## Phase 5: Polish
- [ ] PWA (service worker, offline grocery list, home screen install)
- [ ] Recipe ratings feeding into recommendations
- [ ] Improved ingredient normalization
- [ ] USDA API for precise nutrition (optional)
