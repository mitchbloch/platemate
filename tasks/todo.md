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

## Phase 3: Meal Planning ✅
- [x] Meal plan DAL (`src/lib/mealPlans.ts`) — CRUD, getWeekStart, getMealPlanWithRecipes (joined query)
- [x] Recipe history DAL (`src/lib/recipeHistory.ts`) — logCookedRecipes (idempotent), getLastCookedDates
- [x] Recommendation engine (`src/lib/recommendations.ts`) — recency scoring + cuisine variety penalty
- [x] API routes: GET/POST meal-plans, POST add recipe (auto-creates plan), DELETE remove, POST complete (log history), GET recipe-history
- [x] WeeklyNutritionSummary component — reuses `weeklyNutritionSummary()`, color-coded flags
- [x] WeeklyPlanner component — week navigation, meal cards grouped by type, recipe picker with cuisine/type filters, suggestion banner, optimistic add/remove
- [x] Plan page server component — parallel data fetch, passes to WeeklyPlanner
- [x] Auto-log with override: incomplete week banner prompts to confirm which meals were cooked
- [x] Weeks start on Sunday (matches grocery shopping + first cook of the week)
- [x] Build + lint passing
- [x] Verified: added meals on deployed app, nutrition summary displayed correctly

## Phase 4: Grocery List ✅

### 4A: Core Generation Engine ✅
- [x] Add types: `GroceryDisplayCategory`, `MergedIngredient`, `PinnedGroceryItem`, `GroceryListWithItems`
- [x] Category mapping (`categoryMap.ts`): IngredientCategory → GroceryDisplayCategory (protein, produce, dairy, snacks, other)
- [x] Ingredient normalization (`ingredientMerge.ts`): name normalization, unit normalization, dedup + quantity merge
- [x] Unit tests for merge/dedup edge cases (30 tests)
- [x] Unit tests for category mapping (7 tests)
- [x] Vitest setup (vitest.config.ts, npm test script)

### 4B: API Routes + Grocery Page UI ✅
- [x] Grocery list DAL (`groceryList.ts`): generate, save, get, update, delete, add items
- [x] API routes: POST/GET grocery-lists, POST/PATCH/DELETE items, DELETE list
- [x] GroceryListView component: week nav, generate button, category sections, inline add, check/uncheck, store tagging
- [x] Grocery page server component (replace placeholder)

### 4C: Clipboard Export ✅
- [x] Export formatter (`groceryExport.ts`): unchecked items, grouped by category then store
- [x] "Copy to Notes" button with clipboard API + "Copied!" feedback
- [x] Unit tests for export format (6 tests)

### 4D: Pinned Items + Frequent Suggestions ✅
- [x] Migration: `pinned_grocery_items` table (003_pinned_items.sql)
- [x] Pinned items DAL (`pinnedItems.ts`) + API routes
- [x] Include pinned items in list generation (dedup against recipe items)
- [x] Frequent item suggestions (3+ weeks → suggest for pinning)
- [x] PinnedItemsManager component (pin/unpin, add form, frequent suggestions banner)

### 4E: Real-Time Shared Checking ✅
- [x] Supabase realtime subscription utility (`supabase/realtime.ts`)
- [x] GroceryListView realtime integration (UPDATE/INSERT/DELETE events)
- [x] **Manual step**: Enable Realtime on `grocery_list_items` table in Supabase dashboard
- [x] Migration 005: REPLICA IDENTITY FULL for realtime DELETE filter support

### 4F: Edit/Shop Mode + Pantry Staples ✅
- [x] Migration: `dismissed` column on `grocery_list_items`, `pantry_items` table (004_pantry_and_dismissed.sql)
- [x] Types: `PantryItem` interface, `dismissed` field on `GroceryListItem`
- [x] Pantry items DAL (`pantryItems.ts`): get, add (normalized upsert), remove
- [x] API route: GET/POST/DELETE pantry-items
- [x] DAL updates: `saveGroceryList` accepts `pantryNames` for auto-dismiss, `updateGroceryListItem` accepts `dismissed`
- [x] Generation route: fetches pantry items, passes to saveGroceryList for auto-dismiss
- [x] Export: filters out dismissed items
- [x] Realtime: `dismissed` field syncs
- [x] GroceryListView refactor: Edit mode (dismiss/restore/store change/remove) + Shop mode (checkboxes/copy)
- [x] Collapsed "Excluded" section with restore + pantry staple labeling
- [x] Grocery page: fetches pantry items, passes `initialPantryItems` to GroceryListView
- [x] Build + lint + 43 tests passing
- [ ] **Manual testing**: Verify Edit/Shop flow, dismiss/restore, pantry staples, regeneration auto-dismiss

### 4G: Bug Fixes + UX Improvements (local, not yet pushed)
- [x] Fix: realtime DELETE filter missing grocery_list_id
- [x] Fix: removeItem rollback restores to original position
- [x] Fix: markAsPantryStaple surfaces errors via toast
- [x] Fix: addGroceryListItem explicit dismissed:false
- [x] Fix: excludedExpanded/pantryExpanded reset on week nav
- [x] Fix: timezone bug in week start (toISOString UTC → local date) in GroceryListView, WeeklyPlanner, mealPlans.ts
- [x] UX: click-outside closes store/actions dropdowns (useClickOutside hook)
- [x] UX: 3-dot menu + store tag always visible (not hover-only)
- [x] UX: full row clickable to check off in shop mode
- [x] Feature: separate Pantry Staples expandable section (emerald styling)
- [x] Feature: Move to Pinned Staples from 3-dot menu + pin icon badge
- [x] Feature: Toast component for error/success feedback
- [ ] Commit + push to deploy

## Phase 5: Polish
- [ ] PWA (service worker, offline grocery list, home screen install)
- [ ] Recipe ratings feeding into recommendations
- [ ] Improved ingredient normalization
- [ ] USDA API for precise nutrition (optional)
