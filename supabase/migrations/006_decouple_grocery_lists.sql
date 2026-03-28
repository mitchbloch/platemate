-- Decouple grocery lists from meal plans
-- Allows grocery lists to exist independently (keyed by week_start)
-- Enables manual item adding before meal planning + staples pre-population

-- Step 1: Add week_start column (nullable for backfill)
ALTER TABLE grocery_lists ADD COLUMN week_start date;

-- Step 2: Backfill from meal_plans
UPDATE grocery_lists gl
SET week_start = mp.week_start
FROM meal_plans mp
WHERE gl.meal_plan_id = mp.id;

-- Step 3: Make NOT NULL + unique (one list per week)
ALTER TABLE grocery_lists ALTER COLUMN week_start SET NOT NULL;
ALTER TABLE grocery_lists ADD CONSTRAINT grocery_lists_week_start_unique UNIQUE (week_start);

-- Step 4: Make meal_plan_id nullable, change cascade to SET NULL
ALTER TABLE grocery_lists ALTER COLUMN meal_plan_id DROP NOT NULL;
ALTER TABLE grocery_lists DROP CONSTRAINT grocery_lists_meal_plan_id_fkey;
ALTER TABLE grocery_lists ADD CONSTRAINT grocery_lists_meal_plan_id_fkey
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL;

-- Step 5: Add is_manual flag to grocery_list_items
ALTER TABLE grocery_list_items ADD COLUMN is_manual boolean NOT NULL DEFAULT false;

-- Step 6: Backfill is_manual (items with empty recipe_ids are manual)
UPDATE grocery_list_items SET is_manual = true WHERE recipe_ids = '[]'::jsonb;

-- Step 7: Index
CREATE INDEX idx_grocery_lists_week_start ON grocery_lists(week_start);
