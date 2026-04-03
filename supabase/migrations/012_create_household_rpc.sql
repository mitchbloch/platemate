-- Atomic household creation function (SECURITY DEFINER)
-- Replaces the multi-step DAL approach that had RLS timing issues for brand-new users.
-- Creates household + member + user profile in a single transaction.

CREATE OR REPLACE FUNCTION create_household_with_member(
  household_name text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
BEGIN
  -- Require authenticated caller
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create the household
  INSERT INTO households (name)
  VALUES (household_name)
  RETURNING id INTO new_household_id;

  -- Add the calling user as admin
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (new_household_id, auth.uid(), 'admin');

  -- Upsert user profile with this household as active
  INSERT INTO user_profiles (id, display_name, active_household_id)
  VALUES (auth.uid(), p_display_name, new_household_id)
  ON CONFLICT (id) DO UPDATE
    SET active_household_id = EXCLUDED.active_household_id,
        display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
        updated_at = now();

  RETURN new_household_id;
END;
$$;

-- Only allow authenticated users to call this function
REVOKE ALL ON FUNCTION create_household_with_member(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_household_with_member(text, text) TO authenticated;
