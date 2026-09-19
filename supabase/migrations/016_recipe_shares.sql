-- Phase 8D: shareable recipe links.
--
-- One active share row per (recipe, sharer), reused on repeat shares so the
-- link stays stable; revoked rows are kept for history. The public page
-- reads through get_shared_recipe(), a SECURITY DEFINER RPC callable by
-- anon that returns only the recipe's public fields (never household ids)
-- and bumps view_count. Saving is save_shared_recipe(): one SECURITY DEFINER
-- call that copies the recipe into the caller's active household AND bumps
-- save_count, so the count can only move when a copy was really made.
--
-- Known trade-off (accepted in the spec): view counting on an unauthenticated
-- endpoint is spammable; fine at friends-and-family scale.

BEGIN;

CREATE TABLE recipe_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,            -- 16 random bytes, base64url, generated in app
  view_count integer NOT NULL DEFAULT 0,
  save_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX recipe_shares_active_unique
  ON recipe_shares(recipe_id, created_by) WHERE revoked_at IS NULL;
CREATE INDEX idx_recipe_shares_household ON recipe_shares(household_id);
CREATE INDEX idx_recipe_shares_recipe ON recipe_shares(recipe_id);

ALTER TABLE recipe_shares ENABLE ROW LEVEL SECURITY;

-- Intentionally household-wide (not created_by-scoped): a household shares
-- its recipes, so either partner can see and disable a link. household_id
-- is always the RECIPE's household (set by the app from the recipe row).
CREATE POLICY "Household members can select shares" ON recipe_shares
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Members create their own shares" ON recipe_shares
  FOR INSERT WITH CHECK (
    household_id IN (SELECT user_household_ids()) AND created_by = auth.uid()
  );
CREATE POLICY "Household members can revoke shares" ON recipe_shares
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
-- No DELETE policy: revoked rows are history.

-- ── Public read by token ──
CREATE OR REPLACE FUNCTION get_shared_recipe(token_input text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share recipe_shares%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO share
  FROM recipe_shares
  WHERE token = token_input AND revoked_at IS NULL;

  IF share.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'recipeId', r.id,
    'sharedBy', p.display_name,
    'recipe', jsonb_build_object(
      'title', r.title,
      'description', r.description,
      'cuisine', r.cuisine,
      'mealType', r.meal_type,
      'difficulty', r.difficulty,
      'servings', r.servings,
      'totalTimeMinutes', r.total_time_minutes,
      'ingredients', r.ingredients,
      'instructions', r.instructions,
      'nutrition', r.nutrition,
      'dietaryFlags', COALESCE(r.dietary_flags, '{}'::text[]),
      'tags', r.tags,
      'imageUrl', r.image_url,
      'isSlowCooker', r.is_slow_cooker,
      'sourceUrl', r.source_url,
      'sourceName', r.source_name
    )
  ) INTO result
  FROM recipes r
  LEFT JOIN user_profiles p ON p.id = share.created_by
  WHERE r.id = share.recipe_id;

  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE recipe_shares SET view_count = view_count + 1 WHERE id = share.id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_shared_recipe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shared_recipe(text) TO anon, authenticated;

-- ── Save a shared recipe into the caller's active household ──
-- Returns {"recipeId": uuid, "existing": bool}. "existing" means the active
-- household already has that exact recipe (e.g. a partner shared it), so
-- nothing was copied and save_count is untouched.
CREATE OR REPLACE FUNCTION save_shared_recipe(token_input text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share recipe_shares%ROWTYPE;
  src recipes%ROWTYPE;
  target_household uuid;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO share FROM recipe_shares WHERE token = token_input AND revoked_at IS NULL;
  IF share.id IS NULL THEN
    RAISE EXCEPTION 'This link is no longer active';
  END IF;

  SELECT active_household_id INTO target_household FROM user_profiles WHERE id = auth.uid();
  IF target_household IS NULL OR NOT EXISTS (
    SELECT 1 FROM household_members WHERE household_id = target_household AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No active household';
  END IF;

  IF EXISTS (SELECT 1 FROM recipes WHERE id = share.recipe_id AND household_id = target_household) THEN
    RETURN jsonb_build_object('recipeId', share.recipe_id, 'existing', true);
  END IF;

  SELECT * INTO src FROM recipes WHERE id = share.recipe_id;
  IF src.id IS NULL THEN
    RAISE EXCEPTION 'This link is no longer active';
  END IF;

  INSERT INTO recipes (
    household_id, title, source_url, source_name, description, cuisine, meal_type,
    difficulty, servings, total_time_minutes, ingredients, instructions, nutrition,
    dietary_flags, tags, image_url, is_slow_cooker
  ) VALUES (
    target_household, src.title, src.source_url, src.source_name, src.description, src.cuisine, src.meal_type,
    src.difficulty, src.servings, src.total_time_minutes, src.ingredients, src.instructions, src.nutrition,
    src.dietary_flags, src.tags, src.image_url, src.is_slow_cooker
  ) RETURNING id INTO new_id;

  UPDATE recipe_shares SET save_count = save_count + 1 WHERE id = share.id;
  RETURN jsonb_build_object('recipeId', new_id, 'existing', false);
END;
$$;

REVOKE ALL ON FUNCTION save_shared_recipe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_shared_recipe(text) TO authenticated;

COMMIT;
