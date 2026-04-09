-- Add grocery list tables to the Supabase realtime publication so that
-- postgres_changes subscriptions actually receive events.
-- grocery_list_items already has REPLICA IDENTITY FULL (migration 005).
ALTER TABLE grocery_lists REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'grocery_list_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE grocery_list_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'grocery_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE grocery_lists;
  END IF;
END $$;
