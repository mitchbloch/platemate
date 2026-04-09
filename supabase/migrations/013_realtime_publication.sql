-- Add grocery list tables to the Supabase realtime publication so that
-- postgres_changes subscriptions actually receive events.
-- grocery_list_items already has REPLICA IDENTITY FULL (migration 005).
ALTER TABLE grocery_lists REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE grocery_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE grocery_lists;
