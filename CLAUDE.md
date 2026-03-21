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
- **Client components** only when needed (`"use client"` for forms, auth state)
- **JSONB ingredients** in recipes table (no normalization until Phase 4)
- **Single Claude API call** per recipe import (extraction + nutrition in one pass)

## Conventions
- `@/*` path alias for `src/`
- snake_case in DB, camelCase in TypeScript (DAL handles conversion)
- Utility functions, not classes
- Tailwind v4 with `@theme inline` for custom colors

## Key Files
- `src/lib/types.ts` — All domain types, nutrition thresholds
- `src/lib/recipeParser.ts` — URL → HTML → Claude → ParsedRecipe
- `src/lib/nutrition.ts` — Health flags, weekly summaries
- `src/lib/recipes.ts` — Supabase CRUD (snake_case ↔ camelCase conversion)
- `src/lib/supabase/` — Client (browser), server, middleware, auth helpers
- `src/components/RecipeDetail.tsx` — Recipe view/edit/delete (client component)
- `src/components/RecipeForm.tsx` — Recipe import flow (URL → parse → review → save)
- `supabase/migrations/` — DB schema (001 initial, 002 consolidate time fields)

## Auth
- Two users (created manually in Supabase dashboard)
- Shared data via RLS: `auth.uid() IS NOT NULL`
- Middleware redirects unauthenticated users to `/login`

## Phases
1. **Foundation** — Scaffolding, auth, navigation, DB schema ✅
2. **Recipe Management** — Import, parse, CRUD, library UI ✅
3. **Meal Planning** — Recommendations, weekly planner, nutrition summary
4. **Grocery List** — Dedup, store tagging, real-time shared list
5. **Polish** — PWA, ratings, improved normalization

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
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
```
