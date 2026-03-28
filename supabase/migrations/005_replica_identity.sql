-- Enable REPLICA IDENTITY FULL so realtime DELETE events include all old row data.
-- Required for filtered DELETE subscriptions in Supabase Realtime.
ALTER TABLE grocery_list_items REPLICA IDENTITY FULL;
