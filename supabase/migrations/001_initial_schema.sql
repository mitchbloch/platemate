-- Platemate initial schema
-- Run this in Supabase SQL Editor

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Recipes ──
create table recipes (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  source_url text,
  source_name text,
  description text,
  cuisine text not null default 'other',
  meal_type text not null default 'dinner',
  difficulty text not null default 'medium',
  servings integer not null default 4,
  total_time_minutes integer,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  nutrition jsonb,
  tags jsonb not null default '[]'::jsonb,
  image_url text,
  is_slow_cooker boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Meal Plans ──
create table meal_plans (
  id uuid primary key default uuid_generate_v4(),
  week_start date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Meal Plan Recipes (junction) ──
create table meal_plan_recipes (
  id uuid primary key default uuid_generate_v4(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  meal_type text not null default 'dinner',
  servings_override integer
);

-- ── Grocery Lists ──
create table grocery_lists (
  id uuid primary key default uuid_generate_v4(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Grocery List Items ──
create table grocery_list_items (
  id uuid primary key default uuid_generate_v4(),
  grocery_list_id uuid not null references grocery_lists(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  category text not null default 'other',
  store text not null default 'trader-joes',
  checked boolean not null default false,
  recipe_ids jsonb not null default '[]'::jsonb
);

-- ── Recipe History ──
create table recipe_history (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  cooked_at date not null default current_date,
  rating integer check (rating between 1 and 5),
  notes text
);

-- ── Ingredients Catalog (Phase 4) ──
create table ingredients (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  category text not null default 'other',
  default_store text not null default 'trader-joes',
  aliases jsonb not null default '[]'::jsonb
);

-- ── Indexes ──
create index idx_recipes_cuisine on recipes(cuisine);
create index idx_recipes_meal_type on recipes(meal_type);
create index idx_recipes_is_slow_cooker on recipes(is_slow_cooker);
create index idx_recipes_created_at on recipes(created_at desc);
create index idx_meal_plans_week_start on meal_plans(week_start);
create index idx_meal_plan_recipes_plan on meal_plan_recipes(meal_plan_id);
create index idx_meal_plan_recipes_recipe on meal_plan_recipes(recipe_id);
create index idx_grocery_list_items_list on grocery_list_items(grocery_list_id);
create index idx_recipe_history_recipe on recipe_history(recipe_id);
create index idx_recipe_history_cooked_at on recipe_history(cooked_at desc);

-- ── Updated_at trigger ──
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger recipes_updated_at
  before update on recipes
  for each row execute function update_updated_at();

create trigger meal_plans_updated_at
  before update on meal_plans
  for each row execute function update_updated_at();

create trigger grocery_lists_updated_at
  before update on grocery_lists
  for each row execute function update_updated_at();

-- ── Row Level Security ──
-- Simple RLS: any authenticated user can read/write all data (shared household)
alter table recipes enable row level security;
alter table meal_plans enable row level security;
alter table meal_plan_recipes enable row level security;
alter table grocery_lists enable row level security;
alter table grocery_list_items enable row level security;
alter table recipe_history enable row level security;
alter table ingredients enable row level security;

create policy "Authenticated users can do everything" on recipes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated users can do everything" on meal_plans
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated users can do everything" on meal_plan_recipes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated users can do everything" on grocery_lists
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated users can do everything" on grocery_list_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated users can do everything" on recipe_history
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated users can do everything" on ingredients
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
