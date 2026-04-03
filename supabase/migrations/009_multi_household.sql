-- Phase 5B.1: Multi-Household Support
-- New tables, household scoping on all data tables, RLS rewrite, data migration

BEGIN;

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════
-- 1. NEW TABLES
-- ═══════════════════════════════════════════════════════════

-- Households
CREATE TABLE households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL DEFAULT substr(md5(random()::text), 1, 12),
  invite_code_expires_at timestamptz,
  grocery_stores text[] NOT NULL DEFAULT '{trader-joes}',
  default_store text NOT NULL DEFAULT 'trader-joes',
  meal_schedule jsonb NOT NULL DEFAULT '{"breakfast":0,"lunch":0,"dinner":3,"snacks":0}'::jsonb,
  default_servings integer NOT NULL DEFAULT 2,
  dietary_preferences text[] NOT NULL DEFAULT '{}',
  grocery_categories jsonb NOT NULL DEFAULT '[
    {"name":"Protein","ingredientTypes":["meat","seafood"]},
    {"name":"Produce","ingredientTypes":["produce"]},
    {"name":"Dairy","ingredientTypes":["dairy"]},
    {"name":"Pantry","ingredientTypes":["grain","canned","spice","oil-vinegar","condiment"]},
    {"name":"Other","ingredientTypes":["frozen","other"]}
  ]'::jsonb,
  nutrition_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_households_invite_code ON households(invite_code);

-- Household members (junction)
CREATE TABLE household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(household_id, user_id)
);

CREATE INDEX idx_household_members_user ON household_members(user_id);
CREATE INDEX idx_household_members_household ON household_members(household_id);

-- Household invites (email-based)
CREATE TABLE household_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_household_invites_email ON household_invites(email);
CREATE INDEX idx_household_invites_household ON household_invites(household_id);

-- User profiles
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_skipped boolean NOT NULL DEFAULT false,
  active_household_id uuid REFERENCES households(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at triggers for new tables
CREATE TRIGGER households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 2. MEAL TYPE MIGRATION
-- ═══════════════════════════════════════════════════════════

UPDATE recipes SET meal_type = 'lunch' WHERE meal_type = 'slow-cooker-lunch';
UPDATE meal_plan_recipes SET meal_type = 'lunch' WHERE meal_type = 'slow-cooker-lunch';

-- ═══════════════════════════════════════════════════════════
-- 3. ADD household_id TO EXISTING TABLES (nullable first)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE recipes ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE meal_plans ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE meal_plan_recipes ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE grocery_lists ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE grocery_list_items ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE recipe_history ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE pinned_grocery_items ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE pantry_items ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE ingredients ADD COLUMN household_id uuid REFERENCES households(id);

-- ═══════════════════════════════════════════════════════════
-- 4. DATA MIGRATION — Create Bloch household + backfill
-- ═══════════════════════════════════════════════════════════

-- Create the Bloch household with a deterministic UUID
INSERT INTO households (id, name, grocery_stores, default_store, meal_schedule, default_servings, nutrition_priorities)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Bloch',
  '{trader-joes,whole-foods,hmart,target,other}',
  'trader-joes',
  '{"breakfast":0,"lunch":1,"dinner":3,"snacks":0}'::jsonb,
  2,
  '[{"nutrient":"cholesterol","rank":1},{"nutrient":"saturatedFat","rank":2},{"nutrient":"sodium","rank":3}]'::jsonb
);

-- Add all existing users as admins of the Bloch household
INSERT INTO household_members (household_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', id, 'admin'
FROM auth.users;

-- Create user profiles for existing users (onboarding already completed)
INSERT INTO user_profiles (id, display_name, onboarding_completed, active_household_id)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), true, '00000000-0000-0000-0000-000000000001'
FROM auth.users;

-- Backfill household_id on all data tables
UPDATE recipes SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE meal_plans SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE meal_plan_recipes SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE grocery_lists SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE grocery_list_items SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE recipe_history SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE pinned_grocery_items SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE pantry_items SET household_id = '00000000-0000-0000-0000-000000000001';
UPDATE ingredients SET household_id = '00000000-0000-0000-0000-000000000001';

-- ═══════════════════════════════════════════════════════════
-- 5. SET NOT NULL + INDEXES on household_id columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE recipes ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE meal_plans ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE meal_plan_recipes ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE grocery_lists ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE grocery_list_items ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE recipe_history ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE pinned_grocery_items ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE pantry_items ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE ingredients ALTER COLUMN household_id SET NOT NULL;

CREATE INDEX idx_recipes_household ON recipes(household_id);
CREATE INDEX idx_meal_plans_household ON meal_plans(household_id);
CREATE INDEX idx_meal_plan_recipes_household ON meal_plan_recipes(household_id);
CREATE INDEX idx_grocery_lists_household ON grocery_lists(household_id);
CREATE INDEX idx_grocery_list_items_household ON grocery_list_items(household_id);
CREATE INDEX idx_recipe_history_household ON recipe_history(household_id);
CREATE INDEX idx_pinned_grocery_items_household ON pinned_grocery_items(household_id);
CREATE INDEX idx_pantry_items_household ON pantry_items(household_id);
CREATE INDEX idx_ingredients_household ON ingredients(household_id);

-- ═══════════════════════════════════════════════════════════
-- 6. UPDATE UNIQUE CONSTRAINTS (add household scoping)
-- ═══════════════════════════════════════════════════════════

-- grocery_lists: week_start unique per household
ALTER TABLE grocery_lists DROP CONSTRAINT grocery_lists_week_start_unique;
ALTER TABLE grocery_lists ADD CONSTRAINT grocery_lists_household_week_unique UNIQUE(household_id, week_start);

-- pantry_items: name unique per household
ALTER TABLE pantry_items DROP CONSTRAINT pantry_items_name_unique;
ALTER TABLE pantry_items ADD CONSTRAINT pantry_items_household_name_unique UNIQUE(household_id, name);

-- meal_plans: week_start unique per household
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_household_week_unique UNIQUE(household_id, week_start);

-- ═══════════════════════════════════════════════════════════
-- 7. RLS REWRITE — household-scoped policies
-- ═══════════════════════════════════════════════════════════

-- Helper function: returns household IDs the current user belongs to
CREATE OR REPLACE FUNCTION user_household_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid();
$$;

-- Drop all old "Authenticated users can do everything" policies
DROP POLICY "Authenticated users can do everything" ON recipes;
DROP POLICY "Authenticated users can do everything" ON meal_plans;
DROP POLICY "Authenticated users can do everything" ON meal_plan_recipes;
DROP POLICY "Authenticated users can do everything" ON grocery_lists;
DROP POLICY "Authenticated users can do everything" ON grocery_list_items;
DROP POLICY "Authenticated users can do everything" ON recipe_history;
DROP POLICY "Authenticated users can do everything" ON ingredients;
DROP POLICY "Authenticated users can do everything" ON pinned_grocery_items;
DROP POLICY "Authenticated users can manage pantry items" ON pantry_items;

-- Data tables: household members can CRUD their household's data
CREATE POLICY "Household members can select" ON recipes
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON recipes
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON recipes
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON recipes
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON meal_plans
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON meal_plans
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON meal_plans
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON meal_plans
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON meal_plan_recipes
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON meal_plan_recipes
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON meal_plan_recipes
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON meal_plan_recipes
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON grocery_lists
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON grocery_lists
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON grocery_lists
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON grocery_lists
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON grocery_list_items
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON grocery_list_items
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON grocery_list_items
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON grocery_list_items
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON recipe_history
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON recipe_history
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON recipe_history
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON recipe_history
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON ingredients
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON ingredients
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON ingredients
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON ingredients
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON pinned_grocery_items
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON pinned_grocery_items
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON pinned_grocery_items
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON pinned_grocery_items
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

CREATE POLICY "Household members can select" ON pantry_items
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert" ON pantry_items
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can update" ON pantry_items
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete" ON pantry_items
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

-- Enable RLS on new tables
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Households: members can read, admins can update, any authenticated user can create
CREATE POLICY "Members can view their households" ON households
  FOR SELECT USING (id IN (SELECT user_household_ids()));
CREATE POLICY "Admins can update their households" ON households
  FOR UPDATE USING (
    id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
CREATE POLICY "Authenticated users can create households" ON households
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Household members: members can see co-members, admins can manage
CREATE POLICY "Members can view household members" ON household_members
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Admins can insert members" ON household_members
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    -- Also allow: user inserting themselves (for join-by-code flow)
    OR user_id = auth.uid()
  );
CREATE POLICY "Admins can update members" ON household_members
  FOR UPDATE USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
CREATE POLICY "Admins can remove members" ON household_members
  FOR DELETE USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    -- Users can also remove themselves
    OR user_id = auth.uid()
  );

-- Household invites: admins manage, users can see invites sent to their email
CREATE POLICY "Admins can manage invites" ON household_invites
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
CREATE POLICY "Users can see their own invites" ON household_invites
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- User profiles: users can only access their own
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

COMMIT;
