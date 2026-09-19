# Phase 8: Mobile QoL + Share, Search, Staples, Generation

> Spec agreed 2026-09-14 after a full-codebase review and a grilling session.
> Five batches, one PR each, merged and deployed in order A → E so each can be
> verified on-device before the next stacks on it. Production is at PR #32 and
> migrations 001–015 are applied (verified live: `join_household_by_code` and
> `regenerate_invite_code` exist and enforce auth).

## Root causes found during review

| Symptom | Root cause | Where |
| --- | --- | --- |
| Meal type shows Breakfast after saving Dinner; time, source link, slow-cooker badge, dietary flags never shown | Detail page and library page pass the raw snake_case row into components with `as unknown as Recipe`, bypassing `rowToRecipe`. `recipe.mealType` is undefined so the `<select>` falls back to its first option. The save *does* write (Plan filter proves it); the re-read shows the raw row again. | `src/app/recipes/[id]/page.tsx`, `src/app/recipes/page.tsx` |
| Ingredient edits "don't save" | The editor edits `ingredient.raw`; view mode and the grocery list read `quantity`/`unit`/`name`. | `RecipeDetail.tsx`, `RecipeForm.tsx` |
| Save fails with a bare alert | PATCH route forwards the body to the DB with no validation (`servings: 0` trips the CHECK constraint). | `src/app/api/recipes/[id]/route.ts` |
| Add button off-screen in the plan picker | Grids have no explicit `grid-cols-1` on mobile, so the implicit `auto` track sizes to the row's min-content width; the compact nutrition badge is a non-wrapping flex row, so the track exceeds the viewport. Same gap in 3 other grids. | `WeeklyPlanner.tsx`, `page.tsx`, `recipes/page.tsx`, `recipes/loading.tsx` |
| Taps feel dead / slow; force-quit needed | Every nav tap is a server round-trip: middleware calls the Supabase Auth server on every request, then each DAL call runs `getActiveHouseholdId()` (another auth-server call + profile query) — the plan page does this 4–5× per render. No `loading.tsx` on `/`, `/plan`, `/grocery`, `/settings`, no pending state on the nav. Most buttons are 28–32px tall. iOS suspends the PWA and kills in-flight fetches; a navigation whose fetch died never resolves. | `src/lib/supabase/middleware.ts`, `src/lib/supabase/auth.ts`, `Nav.tsx` |
| "04" when typing 4 in meal schedule | `Number(e.target.value)` on every keystroke: clearing the field yields 0, which is re-rendered before the next digit. Same pattern on 6 other number inputs. | `HouseholdSettings.tsx`, `RecipeDetail.tsx`, `RecipeForm.tsx`, `GroceryListView.tsx` |
| Weekly staple can't be re-tagged | No PATCH endpoint; `PinnedItemsManager.tsx` is dead code (imported nowhere); the staples section hides any staple skipped this week. | `src/app/api/pinned-items/route.ts`, `GroceryListView.tsx` |
| "greek yogurt" and "FAGE 100% greek yoghurt" don't merge | Purely rule-based normalizer; fails on brand token, `100%` token, and yoghurt/yogurt spelling. Phase 5B design assumed a `canonical_ingredients` table that was never built. | `src/lib/ingredientMerge.ts` |

## Decisions locked

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| 1 | Delivery | One PR per batch, merged + auto-deployed in order A→E | Verify tap-latency fix on-device before features stack on it |
| 2 | Auth fast path | Middleware verifies the session JWT locally via `getClaims()` (project already publishes an ES256 key at `/auth/v1/.well-known/jwks.json`) | Removes one auth-server round-trip per request |
| 3 | Household lookup | `getUser` / `getActiveHouseholdId` wrapped in React `cache()` | 4–5 redundant auth+profile calls per page render → 1 |
| 4 | Touch targets | 44px minimum on the elements tapped repeatedly (bottom nav, picker Add, meal-card remove, grocery row actions), not every button | Apple HIG; scoped to keep the diff honest |
| 5 | Ingredient editing | Structured row (qty, unit, name; category + prep in a collapsed second row). `raw` regenerated from the fields on edit | What you type is exactly what saves; no parser guessing |
| 6 | Shared editor | One `RecipeEditor` component used by import review, detail edit, and generation save | Two near-duplicate 150-line blocks today; generation would make three |
| 7 | Grocery merge | Claude emits `shoppingName` per ingredient inside the existing import extraction call (zero extra calls). Merge keys and displays on it. Rule engine also learns `\d+%` and yoghurt→yogurt | Judgment happens where Claude already reads every ingredient; rules bound its variance |
| 8 | Shopping-name rule | Drop brand, marketing, size words always; drop fat level on milk/yogurt unless the recipe depends on it; keep form (canned/fresh), cut (thighs/breast), type (greek/regular). Merged lines display the canonical name ("Milk") | The "what you'd write on a paper list" test; one carton covers both recipes |
| 9 | Backfill | One-shot idempotent local script with the service-role key (never committed), Haiku 4.5, covers all households | Every old recipe merges properly from the next list onward |
| 10 | Onboarding | Shared `NumberField` (text while typing, clamp on blur/Enter, numeric keyboard) replaces every coerce-on-keystroke input, plus a full phone-width walkthrough of signup → household → preferences → tour | Generalized fix, then look for what else is awkward |
| 11 | Share visibility | Full recipe visible to anyone with the link; "Save to Platemate" requires sign-in | A link nobody can read is a link nobody opens |
| 12 | Share model | `recipe_shares` table: one active row per (recipe, sharer) reused on repeat shares; `revoked_at`; `view_count`/`save_count` bumped by the public RPC. Sharer sees "Shared · N views · N saved" | Stable links plus analytics; known drawback: unauthenticated view counting is spammable (acceptable at this scale) |
| 13 | Saved copy | Independent copy in the recipient's household; keeps `sourceUrl`/`sourceName`; no back-reference column | Nobody syncs recipe edits across households |
| 14 | Search | Client-side over recipes both pages already load; matches title, cuisine, tags, meal type, ingredient names. Query in URL on Recipes page, in state in the plan picker | Fine into the low thousands; ingredient search is the fridge-planning case |
| 15 | Staple edits | Editing a staple also updates the matching unchecked copy in this week's list; skipped staples stay visible with a restore action | Otherwise "did it save?" again |
| 16 | Generation entry | Dedicated `/recipes/generate` chat page; Save creates the recipe and jumps to its detail page | Chat needs vertical space; detail page already has Edit |
| 17 | Generation inputs | Text, up to 3 photos per message (downscaled client-side to 1280px JPEG), library matching with View + Add to plan; household dietary prefs, tracked nutrients and default servings injected into the prompt | Cholesterol-aware generation is why this beats a generic chatbot |
| 18 | Turn shape | Structured output per turn: reply text plus *either* up to 3 brief options *or* a full `ParsedRecipe` draft; no streaming in v1 (10–20s per full draft, ~3s for options) | Same wait as import; streaming can come later without changing the data model |
| 19 | Generation persistence | `recipe_generations` table, household-scoped; photo bytes not stored (marker + extracted ingredient list instead); Discard deletes the row; Save links the chat to the recipe | Survives iOS killing the PWA; nothing accumulates unless saved |
| 20 | Testing | Add `@testing-library/react` + jsdom to Vitest; pure functions stay in lib with unit tests, shared components get behavior tests | "Well-tested" has to be a fact, not a claim |
| 21 | Models | Sonnet 5 for import and generation; Haiku 4.5 for backfill. Prompt caching on the library block | Cost/latency fit |

Routine calls made without asking: search hides the Suggestions banner while a query is active; `PinnedItemsManager.tsx` deleted; renaming a staple renames this week's copy; login and signup honor a same-origin `next` param; conversations capped at 20 turns; bottom bar loses `backdrop-blur` (solid surface) while the paper-grain overlay stays; resume-from-background after ≥5 minutes refreshes route data and auth session.

---

## Batch A — Mobile QoL fixes

### A1. Recipe data path (edits-don't-save root cause)
- `recipes/[id]/page.tsx` → `getRecipe(id)`; `recipes/page.tsx` → `listRecipes()` (also fixes the library page not scoping by active household).
- Delete the duplicate `rowToRecipe` in `mealPlans.ts`; export the one in `recipes.ts`.
- New `src/lib/recipeValidation.ts`: `validateRecipeUpdate(body): { ok: true; updates } | { ok: false; error }`. Coerces enums (reuse the `asEnum`/`asNumber` helpers by exporting them from `recipeParser.ts`), integer `servings ≥ 1`, `totalTimeMinutes ≥ 0 | null`, ingredient shape (name non-empty, quantity number|null, category enum). PATCH returns 400 with the message; `RecipeDetail` shows it instead of "Failed to save".
- The detail page keys `RecipeDetail` on `recipe.updatedAt`, so after a save + `router.refresh()` it remounts with the fresh row (today `useState(initial)` ignores prop updates, so a second edit in the same session starts from stale state). `updateRecipe` always issues an UPDATE, so `updated_at` changes on every save.

### A2. Shared `RecipeEditor`
- `src/components/RecipeEditor.tsx`: props `{ value: EditableRecipe; onChange(next) }` where `EditableRecipe = Pick<ParsedRecipe, title | description | cuisine | mealType | difficulty | servings | totalTimeMinutes | ingredients | instructions | tags | isSlowCooker>`.
- Ingredient row: `NumberField` qty (decimal, nullable) · unit text · name text · "more" toggle revealing category `<select>` + preparation text · remove. `raw` is regenerated as `[qty] [unit] name[, prep]` whenever a field changes so text export and provenance stay coherent.
- Rows and steps get stable generated keys in editor state (fixes the known-minor index-key focus loss).
- Used by: `RecipeForm` review step, `RecipeDetail` edit mode, and (Batch E) the generation draft. `RecipeForm` and `RecipeDetail` each shrink by ~150 lines.

### A3. Mobile grids
- Add `grid-cols-1` to the four grids without an explicit mobile track: home cards, recipes grid, recipes loading skeleton, planner meal cards and picker rows.
- `NutritionBadge` compact → `flex flex-wrap`. Picker row children keep `min-w-0`.
- Verification: static HTML repro of the picker row at 390px in Chrome before/after (expected: Add button off-screen before, on-screen after), then on-device.

### A4. Touch targets + tap latency
- 44px minimum: bottom nav tabs (`min-h-11`), picker Add and suggestion Add, meal-card remove (44px hit area via padding + negative margin), grocery row checkbox rows and 3-dot menus, week nav arrows. `touch-action: manipulation` on `button, a` in `globals.css`.
- Middleware: `supabase.auth.getClaims()` instead of `getUser()`; any error → unauthenticated. Keep the `platemate-has-household` cookie logic.
- `src/lib/supabase/auth.ts`: `getUser` and `getActiveHouseholdId` wrapped in `cache()` from React so a render calls each once.
- `loading.tsx` for `/`, `/plan`, `/grocery`, `/settings` (skeletons matching each page's shape; `/recipes` and `/recipes/[id]` already have them).
- `Nav.tsx`: each tab rendered by a `NavTab` child that uses `useLinkStatus()` to show a pending style immediately, and the tapped tab becomes active optimistically. Bottom bar: `bg-surface` solid, no `backdrop-blur`.
- `src/hooks/useResumeRefresh.ts` mounted from a tiny client component in `layout.tsx`: on `visibilitychange` → visible after ≥ 5 min hidden, call `supabase.auth.getSession()` (forces token refresh) then `router.refresh()`.

### A5. `NumberField` + onboarding walkthrough
- `src/components/NumberField.tsx`: `{ value: number | null; onChange(n: number | null); min?; max?; integer?: boolean; allowEmpty?: boolean; className?; id?; placeholder?; "aria-label"? }`. Integer mode strips thousands separators; decimal mode accepts a comma as the decimal point. Keeps a local string while focused; commits a clamped number on blur and Enter; `inputMode="numeric"` (integer) or `"decimal"`; never re-renders a value the user didn't type.
- Replaces: meal schedule ×4 and default servings (`HouseholdSettings`), servings and time (`RecipeEditor`), ingredient quantity (`RecipeEditor`). The two `GroceryListView` quantity inputs already held string state and parsed on submit (no coerce-on-keystroke bug), so they only gained `inputMode="decimal"`.
- Walkthrough: by user decision (2026-09-19) the live phone-width walkthrough moved to the start of Batch B; Batch A reviewed the flow by code instead. Found and fixed: the tour tooltip was always positioned *below* its target, and on phones the targets are the bottom tab bar, so the card rendered off-screen — it now flips above (`positionTooltip`, tested). Tour buttons raised to 44px.

### A6. Component tests
- `@testing-library/react`, `@testing-library/user-event`, `jsdom` dev deps; per-file `// @vitest-environment jsdom`.
- Tests: `NumberField` (clear-then-type yields "4", clamp on blur, Enter commits, null when allowed), `RecipeEditor` (editing qty updates `raw`; removing a row keeps other rows' values), `recipeValidation` (rejects servings 0, coerces bad enum), `Nav` (pending class on tap), `rowToRecipe` round-trip.

### A acceptance
- On iPhone: tapping a bottom tab shows the tab highlighted and a skeleton within ~100ms; Add button visible in the picker without horizontal scroll; changing Meal Type to Dinner and saving shows Dinner after returning; editing an ingredient's name shows the new name in view mode and on the next grocery list; typing 4 in Dinners gives "4".
- `npm run build`, `npm run lint`, `npm run test` clean.

---

## Batch B — Search + weekly staple editing

### B1. Search
- `src/lib/recipeSearch.ts`: `matchesRecipeQuery(recipe, query)`. Tokenize on whitespace; every token must match (case- and diacritic-insensitive substring) at least one of: title, `CUISINE_LABELS[cuisine]`, tags, `MEAL_TYPE_LABELS[mealType]`, ingredient names. Empty query matches everything. Unit-tested (multi-token AND, diacritics, ingredient hit, no false hit on `raw`).
- `src/components/RecipeLibrary.tsx` (client): search input + grid, receives recipes from the server page; reads `?q=` once on mount, mirrors the query into the URL with a debounced native `history.replaceState` (a router navigation on this dynamic page is a server round-trip that echoed stale text into the input when typing fast), and adopts the URL's query only on `popstate` (back/forward). Empty-result state with a clear button.
- Plan picker: search input above the cuisine/type filters; `filteredRecipes` also applies the query; Suggestions banner hidden while the query is non-empty.
- Addendum (user request 2026-09-19): every picker row and suggestion title links to the recipe detail page. The picker's state (open, query, cuisine, type) lives in the URL via the shared `useUrlMirror` hook, and the link carries `?from=<that plan URL>` so the detail page's back link ("← Back to plan", validated same-origin by `backLinkFor`) returns you to the picker exactly as you left it.

### B2. Weekly staples editor
- `PATCH /api/pinned-items` body `{ id, name?, category?, store?, quantity?, unit? }` → `updatePinnedItem` in `pinnedItems.ts` (category through `categoryToDb` on the list side only; pinned rows keep display categories as today).
- Grocery page Weekly Staples section: every staple listed (not just those present this week). Tap → inline form (name, category, store, qty, unit) with Save / Remove. Skipped staples shown muted with "Restore". Staples missing from a list created before they were pinned get "Add this week".
- After a successful staple PATCH, the client PATCHes the matching unchecked list item (`/api/grocery-lists/[id]/items`) with the same fields so this week's list reflects the change; optimistic UI, revert on failure. Name-match uses `normalizeForMatching` on both sides (today it is exact lowercase).
- Delete `src/components/PinnedItemsManager.tsx`.
- Tests: `updatePinnedItem` row mapping; staple↔item matching helper; `matchesRecipeQuery`.

---

## Batch C — Brand-agnostic grocery merge

### C1. `shoppingName` at import
- `Ingredient.shoppingName?: string | null` (optional: existing JSONB rows lack it).
- `RECIPE_JSON_SCHEMA.ingredients.items` gains `shoppingName` (string|null, required in schema). New `SHOPPING_NAME_RULES` prompt block encoding decision #8, with examples: `FAGE 100% greek yoghurt → greek yogurt`; `2% milk → milk`; `heavy whipping cream → heavy cream`; `boneless skinless chicken thighs → chicken thighs`; `San Marzano canned tomatoes → canned tomatoes`; `1 large yellow onion → onion`.
- `validateParsedRecipe` passes it through (lowercased, trimmed, empty → null). The JSON schema requires a plain (non-null) string so Claude always produces one; the validator is what maps a blank answer to null.
- Addendum (implemented 2026-09-19, not in the original spec): the shared `RecipeEditor` shows the shopping name in the collapsed ingredient row ("shops as …") and exposes a "Shops as" field, because it is the only way a user can correct a wrong merge key. Renaming an ingredient drops its shopping name (it was produced for the old name) and renaming back restores it.

### C2. Merge on it
- `deduplicateIngredients`: matching key = `normalizeForMatching(ing.shoppingName ?? ing.name)`; display name = capitalized `shoppingName` when present, else today's `pickDisplayName` behavior. When entries with and without `shoppingName` merge, the canonical name wins.
- Rule engine: on dairy words only, strip percent tokens and fat-level words (`nonfat`, `whole`, `2%`, `fat free`, …) so legacy names without a shopping name match their plain forms; chocolate/vinegar percentages are the product and stay. Spelling map (`yoghurt → yogurt`, `chilli → chili`, `aubergine → eggplant`, `courgette → zucchini`). These dairy rules are NOT applied to canonical shopping names (`trustFatLevel`): Claude already judged per recipe whether the fat level is essential, and the rules must not second-guess a kept "whole milk".
- Tests: new normalizer cases; dedup with mixed shoppingName/none; canonical display wins; existing 158 stay green.

### C3. Backfill
- `scripts/backfill-shopping-names.ts` (run with `node --experimental-strip-types` or `npx tsx`): reads `SUPABASE_SERVICE_ROLE_KEY` + URL from env; selects recipes whose ingredients lack `shoppingName`; batches 20 recipes per Haiku 4.5 call with a structured schema `{ recipes: [{ id, shoppingNames: string[] }] }`; validates array length per recipe; writes back; `--dry-run` prints the plan. Idempotent. Logged counts.
- `tasks/phase5b_smart_grocery_merge.md` gets a superseded banner pointing here.

---

## Batch D — Share

### D1. Schema (migration 016)
```sql
create table recipe_shares (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  household_id uuid not null references households(id),
  created_by uuid not null references auth.users(id),
  token text not null unique,            -- 16 random bytes, base64url, generated in app
  view_count integer not null default 0,
  save_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index recipe_shares_active_unique on recipe_shares(recipe_id, created_by) where revoked_at is null;
-- RLS: household members select/insert/update (same user_household_ids() pattern)
```
- `get_shared_recipe(token_input text)` — SECURITY DEFINER, callable by `anon`: returns `null` if missing/revoked; otherwise increments `view_count` and returns a jsonb of the recipe's public fields (no `household_id`, no ids of other tables) plus the sharer's display name.
- `record_share_save(token_input text)` — SECURITY DEFINER, authenticated only: increments `save_count`.

### D2. Routes
- Middleware public allowlist: `/r/*`, `/api/share/*`.
- `GET /r/[token]` server page: calls the RPC with the anon client; `generateMetadata` sets OG title/description/image (imageUrl when present) for iMessage previews; 404 when null. Renders full recipe (ingredients, instructions, nutrition badge, source link) and a sticky "Save to Platemate" CTA. Signed-out → `/login?next=/r/<token>`; signed in → `POST /api/share/[token]/save`.
- `POST /api/share/[token]/save`: re-reads via RPC, `createRecipe` into the caller's active household (sourceUrl/sourceName preserved, `tags` preserved), `record_share_save`, returns the new id → client routes to `/recipes/<id>`. If the caller's active household already owns the source recipe → 409 with the existing id (client shows "already in your library").
- `POST /api/recipes/[id]/share`: get-or-create the caller's active share row; returns `{ url, viewCount, saveCount }`. `DELETE` revokes.
- `login` and `signup` honor a same-origin `next` param (existing `auth/callback` check reused as a helper); the household-setup step forwards it.

### D3. UI
- `RecipeDetail` view mode: Share button → fetch share → `navigator.share({ title, text, url })` when available, else copy link + toast. Menu: "Copy as text" (`formatRecipeAsText` in `src/lib/recipeShareText.ts`, tested), "Stop sharing". Stats line "Shared · N views · N saved" when a share exists.
- Security: 128-bit tokens; RPC exposes only recipe fields; no enumeration path; `X-Frame-Options` unchanged.
- Tests: `formatRecipeAsText`; `next`-param sanitizer; save route with mocked RPC (409 path, copy path).

---

## Batch E — Recipe generation

### E1. Schema (migration 017)
```sql
create table recipe_generations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  created_by uuid not null references auth.users(id),
  title text not null,                    -- first user message, ≤ 80 chars
  messages jsonb not null default '[]',   -- [{ role, content, options?, recipe?, libraryMatches?, photoSummary? }]
  draft jsonb,                            -- latest ParsedRecipe draft
  status text not null default 'active' check (status in ('active','saved')),
  saved_recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: household members select/insert/update/delete; updated_at trigger
```

### E2. API
- `POST /api/generate` `{ generationId?, message, images?: base64jpeg[] (≤3, ≤600KB each) }` → load/create conversation → build Claude messages (persisted photo turns replaced by `[photo] ingredients seen: …`) → Sonnet 5, `maxDuration = 60`, structured output:
  `{ reply: string, options: [{ title, summary }] | null, recipe: ParsedRecipe | null, libraryMatches: [{ recipeId, reason }] }`
  → validate (`validateParsedRecipe` for the draft; `libraryMatches` filtered to real household recipe ids) → append assistant message, persist, return the turn. 20-turn cap → 409.
- System prompt: role, household dietary preferences, nutrition priorities with the app's thresholds, default servings, the shopping-name rules, and the library digest (`id | title | ingredient names`) as a cached block.
- `GET /api/generate` (active list), `GET /api/generate/[id]`, `DELETE /api/generate/[id]`, `POST /api/generate/[id]/save` → `createRecipe(draft)` + status saved + link.

### E3. UI
- `/recipes/generate` (client page): "Your drafts" strip (resume/discard), thread, composer with photo picker (`accept="image/*" multiple`, canvas downscale to 1280px JPEG q0.8, thumbnails), send. Assistant turns render reply text, option chips (tap sends "Let's make: <title>"), the draft card (collapsible ingredients/instructions + `NutritionBadge`) with Save, and library match cards with View and Add to this week's plan (existing `/api/meal-plans/recipes`).
- Entry points: "Generate a recipe with AI →" on `/recipes/add`; back link to Recipes. Detail page shows "How this was generated" when a saved generation links to it.
- Tests: prompt builder (pure, with household prefs), response validator (drops unknown match ids, rejects both options and recipe null when reply empty), library digest builder, route with mocked Anthropic client (cap, persistence shape).

### E4. Cost posture
- Full-draft turn ≈ 3–5k output tokens on Sonnet 5 (a few cents); options turn ≈ 300. Library digest cached. Behind auth; per-household use only.

---

## Deploy ordering
- D: apply migration 016 before merging. E: apply 017 before merging. A–C need no migrations.

## Verification per batch
- `npm run build` · `npm run lint` · `npm run test` clean, new tests listed above.
- Chrome at 390px against local dev for layout and flows; user verifies on iPhone (installed PWA) before the next batch starts.
- `/code-review` on each PR before merge.
