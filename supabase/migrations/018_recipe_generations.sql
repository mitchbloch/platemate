-- Phase 8E: recipe generation chats.
--
-- A conversation with Claude that ends in a saved recipe (linked) or is
-- discarded (row deleted). Household-scoped like everything else so either
-- partner can pick a chat up. Photo bytes are never stored — user turns keep
-- a count plus the ingredients Claude saw.

BEGIN;

CREATE TABLE recipe_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,                    -- first user message, truncated
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft jsonb,                            -- latest ParsedRecipe draft, if any
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'saved')),
  saved_recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_generations_household ON recipe_generations(household_id, status, updated_at DESC);
CREATE INDEX idx_recipe_generations_saved_recipe ON recipe_generations(saved_recipe_id);

CREATE TRIGGER recipe_generations_updated_at
  BEFORE UPDATE ON recipe_generations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE recipe_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can select generations" ON recipe_generations
  FOR SELECT USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can insert generations" ON recipe_generations
  FOR INSERT WITH CHECK (household_id IN (SELECT user_household_ids()) AND created_by = auth.uid());
CREATE POLICY "Household members can update generations" ON recipe_generations
  FOR UPDATE USING (household_id IN (SELECT user_household_ids()));
CREATE POLICY "Household members can delete generations" ON recipe_generations
  FOR DELETE USING (household_id IN (SELECT user_household_ids()));

COMMIT;
