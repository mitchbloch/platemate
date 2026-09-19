-- Phase 8D: shareable recipe links.
--
-- One active share row per (recipe, sharer), reused on repeat shares so the
-- link stays stable; revoked rows are kept for history. The public page
-- reads through get_shared_recipe(), a SECURITY DEFINER RPC callable by
-- anon that returns only the recipe's public fields (never household ids)
-- and bumps view_count. Saves are counted by record_share_save(), which
-- requires an authenticated caller.
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

-- ── Count a save (authenticated only) ──
CREATE OR REPLACE FUNCTION record_share_save(token_input text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE recipe_shares
  SET save_count = save_count + 1
  WHERE token = token_input AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION record_share_save(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_share_save(text) TO authenticated;

COMMIT;
