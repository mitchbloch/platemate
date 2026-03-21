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
- [x] Build + lint passing

## Phase 3: Meal Planning
- [ ] Recommendation engine (variety, recency, season, nutrition balance, effort mix)
- [ ] Weekly planner UI (suggestions → pick 3-4 → assign to days)
- [ ] Live weekly nutrition summary
- [ ] Recipe history tracking

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
