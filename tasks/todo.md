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
- [x] **Manual testing**: Edit/Shop flow, dismiss/restore, pantry staples verified

### 4G: Bug Fixes + UX Improvements ✅
- [x] Fix: realtime DELETE filter, removeItem rollback, markAsPantryStaple toast, explicit dismissed:false, excludedExpanded reset
- [x] Fix: timezone bug in week start (toISOString UTC → local date)
- [x] UX: click-outside dropdowns, visible 3-dot menu + store tags, full-row click in shop mode
- [x] Feature: Pantry Staples section, Move to Weekly Staples, Toast component
- [x] UX: unified add-item flow (category/store/weekly staple), renamed Pinned → Weekly Staples
- [x] UX: colored store badges on all items, dropdown auto-close on mode/week nav
- [x] Commit + push to deploy

### 4H: Shopping Flow + Drag Reorder ✅
- [x] Shopping mode persistence (status column on grocery_lists, survives navigation)
- [x] Completion flow: modal on all-checked → "Complete & Next Week" or "Go Back"
- [x] Read-only completed weeks with "Reopen" option
- [x] Smart week defaulting: both Plan and Grocery tabs advance after completing current week
- [x] Drag-to-reorder items within groups (edit mode only, @dnd-kit, sort_order column)
- [x] Bulk reorder API endpoint, optimistic UI, realtime sync

### 4I: Grocery List Bugs + UX ✅
- [x] Bug: add-item category selection ignored — fixed: categoryToDb() now called in addGroceryListItem(), passes through valid IngredientCategory values
- [x] Feature: optional quantity field on add-item form — added qty + unit inputs, wired to existing API/DAL
- [x] Bug: fuzzy ingredient matching — fixed: normalize hyphens, compound words (nonfat/non-fat/non fat), parentheticals, trailing commas; 4 new tests
- [x] Feature: inline item editing — "Edit item" in 3-dot menu opens inline form (name, qty, unit, category, store)
- [x] UX: quantity displayed more prominently before item name (text-sm font-medium)
- [x] Bug: add-item form closing prematurely when interacting with non-name fields — moved onBlur to form level with relatedTarget check
- [x] Bug: updateGroceryListItem now converts display categories via categoryToDb()

### 4J: Staple Improvements ✅
- [x] Feature: per-week weekly staple skip — "Skip this week" dismisses for current week only, item re-appears next week
- [x] UX: weekly staple header chip × button now skips this week (was: global unpin)
- [x] UX: "Have this already" hidden for weekly staples (redundant with "Skip this week")
- [x] Feature: "Restore & Edit" in pantry staples section — restore + open inline edit to change quantity
- [x] Build passing, 57 tests

## Phase 5: Polish & Growth
- [ ] iOS/mobile experience (evaluate PWA vs React Native vs Capacitor)
- [ ] Multi-household support (household entity, scoped RLS, shared data)
- [ ] Self-service sign-up + onboarding tutorial
- [ ] Recipe ratings feeding into recommendations
- [ ] Improved ingredient normalization (includes fuzzy matching for grocery dedup)
- [ ] USDA API for precise nutrition — see [phase5_usda_nutrition.md](phase5_usda_nutrition.md)
- [ ] Smart grocery merge (Claude-assisted) — see [phase5b_smart_grocery_merge.md](phase5b_smart_grocery_merge.md) (depends on Phase 5)

## Phase 6: Security & Reliability Audit (2026-07-07) ✅

Full-codebase review (elite-engineer standard): bugs, security holes, real-use breakage. All worth-fixing findings fixed; verified with build + lint + 130 tests.

### 6.1 Critical — Cross-tenant security & data integrity
- [x] RLS: `household_members` INSERT policy let any user add themselves to ANY household — migration 014 drops the clause; joining now goes through `join_household_by_code` SECURITY DEFINER RPC
- [x] Join-by-code was broken for genuinely new users (invite-code lookup ran under member-only SELECT RLS) — fixed by the same RPC; join route rewritten
- [x] Weak invite codes (`md5(random())`) — default now `gen_random_bytes`; admin-gated `regenerate_invite_code` RPC created (was referenced but never existed)
- [x] `getWeekStart()` used the server timezone (UTC on Vercel) — week rolled over at 8pm ET showing next week's plan/list; now computed in America/New_York (+7 regression tests)
- [x] `mergeRecipeItemsIntoList` deleted recipe items FIRST — a mid-merge failure permanently dropped grocery items; now computes everything up front and deletes stale items last
- [x] DAL reads relied on RLS alone — broke for multi-household members (`.maybeSingle()` errors, interleaved data); all reads now scoped by `getActiveHouseholdId()`
- [x] Settings autosave replaced (not merged) pending updates — fast edits to two fields silently dropped the first; now accumulates a batch
- [x] Week navigation had no stale-response guard — out-of-order fetches could show one week's data under another week's header (then mutate the wrong list); monotonic token added in WeeklyPlanner + GroceryListView

### 6.2 High
- [x] SSRF: recipe parser fetched arbitrary user URLs — now http(s)-only, blocks localhost/private/link-local/metadata hosts (`assertPublicHttpUrl`, tested)
- [x] All outbound fetches got 10s timeouts; `parse-text` input capped at 50k chars (was unbounded input to a paid Claude call)
- [x] Onboarding tour targeted `data-tour` attributes that didn't exist — tour was a black overlay past step 1; attributes added to Nav (visible-element picking for mobile/desktop)
- [x] Member role change UI called PATCH on a route that only implemented DELETE (always failed) — PATCH handler added
- [x] Nutrition "daily estimate" was a no-op (`daysInWeek / daysInWeek`) under-flagging cholesterol — intended 40%-of-day weighting implemented (+tests)
- [x] Costco items silently dropped from clipboard export — shared `NON_TJ_STORES` constant in types.ts (regression test)

### 6.3 Medium/Low — Hardening & hygiene
- [x] Get-or-create races (meal plan + grocery list): unique-violation now refetches instead of 500
- [x] Claude output validation: enums/numbers/nested shapes coerced (servings clamped ≥1); Anthropic client made lazy
- [x] `servings >= 1` CHECK constraint + backfill (migration 015); divide-by-zero guard in ingredientMerge (+test)
- [x] `bulkUpdateSortOrder` sequential N+1 → parallel
- [x] `getFrequentItems` used raw lowercase matching — now `normalizeForMatching` (consistent with grocery dedup)
- [x] Add-item form no longer loses input on failed request; "mark as pantry staple" no longer proceeds when the dismiss failed
- [x] Unauthenticated `/api/*` now gets 401 JSON instead of a 307 to login HTML
- [x] auth/callback `next` param restricted to same-origin paths
- [x] Security headers (nosniff, X-Frame-Options DENY, referrer-policy, permissions-policy) in next.config.ts
- [x] `household_invites` visibility policy selected from `auth.users` (unreadable by clients → SELECT errors) — now `auth.jwt()`
- [x] Deleted duplicate migration file `008_sort_order 2.sql`; removed dead/broken DAL functions (`getHouseholdByInviteCode`, `addHouseholdMember`, silent regenerate fallback)

### 6.4 Verification
- [x] `npm run test` — 130 tests passing (was 106; +24 new incl. timezone, SSRF, nutrition, Costco, servings-0 regressions)
- [x] `npm run lint` — clean
- [x] `npm run build` — passing

### Known-minor (deliberately not fixed)
- Array-index React keys in RecipeForm/RecipeDetail ingredient rows (focus-loss UX nit; values stay correct)
- Narrow realtime channel leak on rapid tab-visibility flapping (handlers are idempotent; no data impact)
- `platemate-has-household` cookie can be stale up to 24h after leaving a household (server components still redirect correctly)

### ⚠️ Deploy ordering
Migrations **014 + 015 must be applied to Supabase before deploying** this code — the join route now calls `join_household_by_code`, which doesn't exist until 014 runs.

## Phase 7: Recipe Import & Grocery Merge Reliability (2026-07-07) ✅

Root-caused via Vercel production logs + fixed; verified with live API evals and 158 unit tests.

### 7.1 Recipe import ("links don't work")
- [x] ROOT CAUSE: pinned model `claude-sonnet-4-20250514` was retired by Anthropic — every import (URL, video, and text) had been failing with 404 since at least 7/6. Migrated to `claude-sonnet-5` (SDK bumped 0.52 → 0.110)
- [x] Structured outputs (`output_config.format` + JSON Schema): responses are now guaranteed schema-valid JSON — eliminates the markdown-fence/malformed-JSON failure class entirely
- [x] max_tokens 4096 → 16000 (long recipes could silently truncate mid-JSON); explicit errors for `max_tokens`/`refusal` stop reasons; `maxDuration = 60` on both parse routes

### 7.2 Recipe import ("lossy extraction")
- [x] Completeness rules in both prompts: every ingredient (incl. garnish/"to taste"/sub-component lists) and every step, in order; `raw` must be verbatim
- [x] URL parsing now instructs Claude to prefer schema.org JSON-LD recipe data when present
- [x] TikTok short links (vm.tiktok.com): oEmbed failure now resolves the redirect and retries with the canonical URL
- [x] Live eval: TikTok-style caption → 12/12 ingredients, 8/8 steps, correct servings/time; real Budget Bytes URL → full recipe with source attribution

### 7.3 Grocery merge ("fuzzy matches imperfect and lossy")
- [x] BUG: '-ves' plural rule mangled olives→"olif", chives→"chif", garlic cloves→"garlic clof" (never matched their singulars) — exception list added
- [x] Same ingredient in different units never merged ("2 tbsp butter" + "½ cup butter" = 2 line items) — unit-family conversion added (volume: tsp/tbsp/fl-oz/cup/pt/qt/gal/mL/L; weight: g/kg/oz/lb); bare "oz" deliberately weight-only so liquids never mis-convert
- [x] "3 garlic cloves" (count in name) vs "3 cloves garlic" (count in unit) never merged — trailing count words (clove/bunch/head/stalk/sprig/stick/slice) now stripped from matching keys and promoted to units
- [x] "yellow onion" vs "onion" and "scallions" vs "green onions" never merged — minimal synonym map (colors otherwise preserved: red onion, yellow squash stay distinct)
- [x] Manual-item merge (`mergeManualAndRecipeQuantity`) now also converts within unit families
- [x] Missing unit aliases: package/pkg, jar, bottle, bag, box, container, stick, fluid ounce
- [x] Realistic 3-recipe eval: 22 ingredient lines → 14 correct list items, zero lost, zero mangled

### 7.4 Verification
- [x] 158 unit tests passing (+34 incl. adversarial merge cases), lint clean, build passing
- [x] Live end-to-end evals against the real Claude API (text + URL import)
