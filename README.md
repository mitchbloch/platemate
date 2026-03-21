# Platemate

Weekly meal planning & grocery list tool. AI-powered recipe import with nutrition tracking (cholesterol/sat fat awareness).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Supabase**
   - Create a project at [supabase.com](https://supabase.com)
   - Run `supabase/migrations/001_initial_schema.sql` in the SQL Editor
   - Create two user accounts in Authentication → Users
   - Copy the project URL and anon key

3. **Configure environment**
   ```bash
   cp .env.local.example .env.local
   # Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
   ```

4. **Run locally**
   ```bash
   npm run dev
   ```

## Deployment

Connected to Vercel for auto-deploy on push. Set environment variables in Vercel dashboard.

## Tech Stack

- Next.js 16 + TypeScript + Tailwind v4
- Supabase (Postgres + Auth)
- Claude API (recipe parsing + nutrition)
- Vercel (hosting)
