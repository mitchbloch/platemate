# Platemate — Product Requirements Document

## Problem
Every weekend, a couple plans 2-4 dinners + 1 slow cooker lunch prep, then grocery shops (primarily Trader Joe's). This is fully manual: searching NYT Cooking, TikTok, Instagram, Stealth Health for recipes, then building a grocery list by hand. One partner has high cholesterol, making nutritional awareness (especially cholesterol and saturated fat) a hard requirement.

## Solution
Platemate automates this workflow: curated recipe DB → AI-powered recipe import → health-aware weekly suggestions → store-grouped grocery list.

## Core Workflow
1. **Import** — Paste a recipe URL → AI extracts structured recipe + estimates nutrition
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

## Non-Goals (Phase 1-2)
- Recipe creation from scratch (import-only for now)
- Ingredient catalog / normalization (Phase 4)
- Store-specific availability tagging (Phase 4)
- Real-time shared grocery list (Phase 4)
- PWA / offline support (Phase 5)

## Success Metrics
- Can import a recipe from any major cooking site in <10 seconds
- Nutrition flags correctly identify high-cholesterol recipes
- Weekly planning takes <5 minutes (vs 30+ manual)
- Grocery list is usable in-store on mobile
