-- Allow household co-members to view each other's profiles (for display names in member list)
CREATE POLICY "Household co-members can view profiles" ON user_profiles
  FOR SELECT USING (
    id IN (
      SELECT hm2.user_id FROM household_members hm1
      JOIN household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE hm1.user_id = auth.uid()
    )
  );
