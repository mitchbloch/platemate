# Platemate — Implementation Tracker

## Phase 1: Foundation ✅
- [x] Project scaffolding (package.json, configs, globals.css, root layout)
- [x] Type definitions (`src/lib/types.ts`)
- [x] Supabase client setup (browser + server + middleware + auth helpers)
- [x] Database migration (`001_initial_schema.sql`)
- [x] Auth (login page, useAuth hook, route protection via middleware)
- [x] Navigation + shell pages for all routes
- [x] Git init + GitHub repo + first PR merged
- [x] `npm run build` + `npm run lint` pass
- [x] `npm run dev` starts, auth redirect works
- [ ] Vercel deployment

## Phase 2: Recipe Management ✅ (code complete, needs functional testing)
- [x] Recipe parser (`recipeParser.ts` + `/api/recipes/parse`)
- [x] Nutrition scorer (integrated into parse flow via single Claude call)
- [x] Recipe data layer (`recipes.ts` + API routes: GET/POST/PATCH/DELETE)
- [x] Recipe import UI (`recipes/add/page.tsx` + `RecipeForm.tsx`)
- [x] Recipe library (`recipes/page.tsx` + `RecipeCard.tsx` + `NutritionBadge.tsx`)
- [x] Recipe detail (`recipes/[id]/page.tsx`)

### Phase 2 Verification (do next)
- [ ] Login with test credentials → redirected to dashboard
- [ ] Paste a real recipe URL → recipe extracted with title, ingredients, instructions
- [ ] Nutrition estimates shown with cholesterol flag if applicable
- [ ] Edit extracted fields → save → appears in recipe library
- [ ] Recipe detail page shows all info
- [ ] Delete recipe → removed from library

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

## Remaining Setup
- [ ] Vercel deployment (connect GitHub repo, set env vars)
