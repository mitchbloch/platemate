-- Fix: get_shared_recipe() coerced recipes.dietary_flags as text[], but the
-- column is jsonb (migration 010). Every real share link 400ed with
-- "COALESCE types jsonb and text[] cannot be matched" — the bogus-token
-- path returned early and hid it. Same function, correct type.

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
      'dietaryFlags', COALESCE(r.dietary_flags, '[]'::jsonb),
      'tags', COALESCE(r.tags, '[]'::jsonb),
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
