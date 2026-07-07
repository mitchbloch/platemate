-- Enable Supabase Realtime for grocery_list_items.
-- The table already has REPLICA IDENTITY FULL (migration 005) and the client
-- subscription code exists, but changes were never published because the table
-- was not added to the supabase_realtime publication.
ALTER PUBLICATION supabase_realtime ADD TABLE grocery_list_items;
