-- Add sort_order column for drag-to-reorder within groups
ALTER TABLE grocery_list_items
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Backfill: assign order within each group (store + category) based on current alphabetical order
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY grocery_list_id, store, category
           ORDER BY name
         ) * 1000 AS new_order
  FROM grocery_list_items
)
UPDATE grocery_list_items
SET sort_order = ranked.new_order
FROM ranked
WHERE grocery_list_items.id = ranked.id;

-- Index for efficient ordering within a list
CREATE INDEX idx_grocery_list_items_sort
  ON grocery_list_items (grocery_list_id, sort_order);
