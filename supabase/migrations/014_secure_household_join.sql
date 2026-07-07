-- Security hardening: household membership and invite codes
--
-- 1. CRITICAL: the "Admins can insert members" policy contained
--    `OR user_id = auth.uid()`, letting ANY authenticated user insert
--    themselves into ANY household (full access to that household's data)
--    by calling PostgREST directly with a household id. Membership inserts
--    are now admin-only; joining goes through join_household_by_code().
-- 2. Join-by-code was also broken for genuinely new users: the app looked
--    up households by invite_code under RLS that only lets existing
--    members see the row. The SECURITY DEFINER RPC fixes both.
-- 3. Invite codes were generated with substr(md5(random()), 1, 12) —
--    random() is not cryptographically secure. Derive codes from
--    gen_random_uuid() (core Postgres CSPRNG; the first 12 hex chars of a
--    v4 UUID are 48 fully random bits) — avoids depending on pgcrypto's
--    install schema.
-- 4. SECURITY DEFINER functions get an explicit search_path.
-- 5. The "Users can see their own invites" policy selected from auth.users,
--    which the authenticated role cannot read — any non-admin SELECT on
--    household_invites would error. Use auth.jwt() instead.

BEGIN;

-- ── 1. Membership inserts: admins only ──
DROP POLICY "Admins can insert members" ON household_members;
CREATE POLICY "Admins can insert members" ON household_members
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── 2. Cryptographically secure invite codes for new households ──
ALTER TABLE households
  ALTER COLUMN invite_code SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- ── 3. Join by invite code (validates code + expiry, then adds member) ──
CREATE OR REPLACE FUNCTION join_household_by_code(
  invite_code_input text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO target_id
  FROM households
  WHERE invite_code = invite_code_input
    AND (invite_code_expires_at IS NULL OR invite_code_expires_at > now());

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (target_id, auth.uid(), 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  INSERT INTO user_profiles (id, display_name, active_household_id)
  VALUES (auth.uid(), p_display_name, target_id)
  ON CONFLICT (id) DO UPDATE
    SET active_household_id = EXCLUDED.active_household_id,
        display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
        updated_at = now();

  RETURN target_id;
END;
$$;

REVOKE ALL ON FUNCTION join_household_by_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_household_by_code(text, text) TO authenticated;

-- ── 4. Invite code rotation (admin-only; referenced by the DAL but never created) ──
CREATE OR REPLACE FUNCTION regenerate_invite_code(household_id_input uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = household_id_input
      AND user_id = auth.uid()
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only household admins can regenerate the invite code';
  END IF;

  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  UPDATE households SET invite_code = new_code WHERE id = household_id_input;
  RETURN new_code;
END;
$$;

REVOKE ALL ON FUNCTION regenerate_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION regenerate_invite_code(uuid) TO authenticated;

-- ── 5. Pin search_path on the RLS helper ──
CREATE OR REPLACE FUNCTION user_household_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid();
$$;

-- ── 6. Fix invite-visibility policy (auth.users is not readable by clients) ──
DROP POLICY "Users can see their own invites" ON household_invites;
CREATE POLICY "Users can see their own invites" ON household_invites
  FOR SELECT USING (email = (auth.jwt() ->> 'email'));

COMMIT;
