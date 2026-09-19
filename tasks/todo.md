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

## Phase 8: Mobile QoL + Share, Search, Staples, Generation (2026-09-14)

Spec: [phase8_qol_and_features.md](phase8_qol_and_features.md). One PR per batch, merged in order; user verifies on iPhone between batches.

### 8A: Mobile QoL fixes

> 2026-09-19: Batch A complete and PR'd from `feature/phase8a-mobile-qol`. Live onboarding walkthrough deferred to the start of Batch B (user decision); flow reviewed by code instead.
- [x] A1 Recipe pages use `getRecipe`/`listRecipes` (raw-row root cause); single `rowToRecipe`; `recipeValidation.ts` + PATCH 400s; RecipeDetail re-syncs from props
- [x] A2 Shared `RecipeEditor` (structured ingredient rows, `raw` regenerated, stable keys) used by RecipeForm + RecipeDetail
- [x] A3 `grid-cols-1` on the 4 mobile grids; NutritionBadge compact wraps; 390px repro before/after (Chrome, 390px: Add button right edge 418px vs 374px content edge before → 344px after, button 44px tall)
- [x] A4 44px targets; `touch-action: manipulation`; middleware `getClaims()`; `cache()` on auth helpers; `loading.tsx` ×4; `useLinkStatus` nav + optimistic active tab; solid bottom bar; `useResumeRefresh` (≥5 min)
- [x] A5 `NumberField` replaces the coerce-on-keystroke inputs (HouseholdSettings ×5, RecipeEditor ×3; grocery qty inputs already held strings, got `inputMode="decimal"` only)
- [x] A5 code review of the onboarding flow: FIXED tour tooltip rendering off-screen on phones (always placed below its target; on mobile the targets are the bottom tab bar) — now flips above via `positionTooltip` (+4 tests); tour buttons 44px
- [x] A5 live walkthrough (done at start of Batch B, 2026-09-19, throwaway account + household "Platemate Test Household" created; phone width via a 390px iframe harness behind a header-stripping localhost proxy). Findings: (1) FIXED — tour tooltip stuck at 0,0 with no spotlight: the tour measured its target once per step, but each step navigates and the new instant loading skeletons unmount that nav before ResizeObserver fires; it now re-locates the target on DOM mutations (+2 DOM tests). (2) Email confirmation is OFF on the Supabase project — signup signs in immediately (security observation, surfaced to user). (3) Preference pills are 30px tall (minor, left as is). Signup, household, preferences, tour and Settings all render correctly at 390px; NumberField verified live (clear → "", type 4 → "4"). Cleanup of the throwaway account + env file still due at end of Phase 8.
- [x] Verification: tsc clean, `npm run lint` clean, `npm run build` passing, 204 tests (46 new incl. 8 middleware routing tests)
- [x] A6 Testing Library + jsdom; tests for NumberField (9), RecipeEditor (8), recipeValidation (10), Nav (5), rowToRecipe (1) — 191 total
- [x] `/code-review` (standards + spec agents): fixed 0-minute time being coerced to null, unused-var warning, stale spec text; added middleware tests for the auth-critical change
- [x] PR #33 merged 2026-09-19 after on-device verification

### 8B: Search + weekly staple editing
- [x] B1 `recipeSearch.ts` (+8 tests); `RecipeLibrary` + shared `RecipeSearchInput` with `?q=` mirrored via debounced replace (+5 component tests); planner picker search, Suggestions hidden while filtering
- [x] B2 `PATCH /api/pinned-items` validated by `weeklyStaples.ts` (+6 tests) + `updatePinnedItem`; staples editor lists every staple with Edit / Skip / Restore / Add this week / Remove; edits mirror onto this week's unchecked copy (+5 component tests); fuzzy staple↔item matching via `normalizeForMatching`; `PinnedItemsManager.tsx` deleted
- [x] `/code-review` (standards + spec agents): FIXED `GroceryDisplayCategory` type lying about its values (said lowercase `protein|produce|dairy|snacks|other`; every real value is the capitalized section label) — type now matches, casing canonicalized once in the pinned-items DAL, all `as` casts removed; duplicated remove-staple handler extracted; library search now adopts the URL query on browser back/forward (+1 test); tour target tracking short-circuits while the target is attached; `rowToPinnedItem` test added
- [x] Build + lint + tests clean (233 tests, 29 new in this batch)
- [x] PR #34 merged 2026-09-19 after on-device verification
- [x] Follow-up (user report: Recipes search "backspaces and overwrites" fast typing): the URL mirror used `router.replace`, which on this dynamic page is a server round-trip; when it landed after more typing, the adopt-URL logic echoed the older query into the input. Now mirrors via native `history.replaceState` (no navigation) and adopts the URL only on `popstate` (+1 regression test) — PR #35

### 8C: Brand-agnostic grocery merge
- [x] C1 `shoppingName` in `Ingredient`, JSON schema (required), `SHOPPING_NAME_RULES` in both import prompts, validator passes it through; editor clears it on rename and exposes a "Shops as" field
- [x] C2 Dedup keys/displays on `shoppingName` (canonical display wins over longer branded names); `\d+%` tokens stripped; spelling map (yoghurt→yogurt, chilli→chili, aubergine→eggplant, …); 10 new tests
- [x] C3 `scripts/backfill-shopping-names.ts` via `npm run backfill:shopping-names` (tsx; Haiku 4.5 structured output; batches of 20; idempotent; `--dry-run`, `--limit`); Phase 5B doc marked superseded
- [x] C3 backfill run 2026-09-19: dry run reviewed (two "odd" mappings were the backfill correcting mislabeled imports — source lines checked), then live: 127/127 recipes updated, 0 skipped; re-run reports 0 pending; 6 blank-named ingredients from bad imports now carry a shopping name. Prompt gained a "never substitute a different ingredient" rule; script retries a recipe solo on a count mismatch
- [x] `/code-review` (standards + spec): dairy-only percent strip (chocolate/vinegar percentages kept), shops-as typing fix + restore-on-rename-back, backfill never fabricates a canonical name, missing prompt examples added, coriander/scallions map entries removed
- [x] Build + lint + tests clean (244 tests, 10 new)
- [x] Dairy fat-level words stripped at merge time for names without a shopping name only; canonical names keep Claude's per-recipe judgment (user question during review) — 6 canonical dairy names in the live library kept a fat level (light cream, nonfat greek yogurt, light coconut milk, light sour cream, fat free ultrafiltered milk, reduced fat cream cheese); editable via "Shops as"
- [x] PR #36 merged 2026-09-19
- [x] Enhancement (user, 2026-09-19): plan picker rows link to the recipe detail page; picker state (open/query/filters) mirrored into the URL by the new shared `useUrlMirror` hook (RecipeLibrary refactored onto it); detail page shows "← Back to plan" via a same-origin-checked `?from=` param (+4 planner tests, +2 navigation tests)

### 8D: Share
- [x] D1 Migration 016 `recipe_shares` (unique active row per recipe+sharer, RLS, no delete) + `get_shared_recipe` (anon, returns public fields only, bumps view_count) / `record_share_save` (authenticated) — **apply before merge**
- [x] D2 Public `/r/[token]` page (OG metadata, memoized RPC call so metadata + page = one view, not-found page, sticky Save CTA); `/api/share/[token]/save` (409 with the existing id when already owned; count is best-effort); `/api/recipes/[id]/share` GET/POST/DELETE; middleware `/r/*` public + `next` carried through login and household redirects; login/signup honor `next` end to end
- [x] D3 `ShareRecipeButton` (native share sheet → copy-link fallback, Copy as text, Copy link, Stop sharing with revert, view/save counts); `formatRecipeAsText`; tests: share text, tokens/row mapping + malformed tokens, middleware public route + next, SaveSharedRecipe (4), ShareRecipeButton (4), save route (5)
- [x] PRs #37 + #38 merged 2026-09-19. HOTFIX: every real share link crashed the page — `get_shared_recipe` coerced `dietary_flags` (jsonb) as `text[]`; my live check only used a bogus token, which returns before that line. Migration 017 redefines the function (applied via CLI, production link verified 200). Lesson: probe RPCs with a real row, not just the miss path
- [x] `/code-review` (standards+security, spec): FIXED share row filed under the sharer's active household instead of the recipe's (owning household couldn't see/revoke); FIXED save count inflatable by any signed-in user → copy + count are one atomic `save_shared_recipe` RPC; FIXED "already owned" check was RLS-wide, now active-household; proxy-header origin derivation removed (client builds the URL); recipe body deduplicated into `RecipeContent`; noindex on share pages documented
- [ ] Build + lint + tests clean; `/security-review`; `/code-review`; PR; end-to-end with a second account

### 8E: Recipe generation
- [x] E1 Migration 018 `recipe_generations` (applied 2026-09-19 via CLI; real-row probe: insert, anon blocked, updated_at trigger, delete)
- [x] E2 `POST /api/generate` (Sonnet 5, structured turns: options | draft + library matches + seenIngredients, household prefs, cached library digest, 20-turn cap, refusal → 422) + GET list, GET/DELETE by id, POST save
- [x] E3 `/recipes/generate` page (`?g=` mirrored to the URL): drafts strip, thread, photo picker with canvas downscale to 1280px JPEG, option chips, draft card with Save/Discard, library matches with View (`?from=` back) + Add to this week; entry link on `/recipes/add`; "See the conversation" on detail
- [x] E4 Tests: engine (17), route (9), component (8); `npm run eval:generate` live eval script (run 2026-09-19: options 12.8s → recipe 13.1s → revision 21.7s, cache read on turns 2–3, cholesterol 110 → 78mg)
- [x] `/code-review` (standards+security, spec): FIXED lost-update race when two members append to one chat (optimistic lock on updated_at → 409); FIXED in-flight answer clobbering a chat you switched to; FIXED EXIF orientation on iPhone photos; ADDED household daily cap (100 turns/rolling 24h → 429) since per-chat caps don't bound spend; generic 500 messages with server-side logging; household filter on every mutation; Add-to-plan uses the match's own meal type; failed Discard restores the chat; photo cap matches the spec's 600KB
- [x] Build + lint + tests clean (301 tests)
- [x] PR #40 merged 2026-09-19

### 8F: Wrap-up ✅
- [x] Throwaway account + "Platemate Test Household" deleted (household, member, profile, 1 empty grocery list, auth user); local test/backfill env files removed; localhost credential helpers removed
- [x] All five batches merged: #33 A, #34 B, #35 search fix, #36 C, #37 picker links, #38 D, #39 share hotfix, #40 E. Migrations 016–018 applied. 301 tests.
- [ ] User: turn on email confirmation in Supabase Auth (Dashboard → Authentication → Providers → Email → "Confirm email") — shared links now send strangers to signup
- [ ] Build + lint + tests clean; `/code-review`; PR; live eval with the real API
