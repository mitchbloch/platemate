-- Add shopping status and completion tracking to grocery lists
ALTER TABLE grocery_lists ADD COLUMN status text NOT NULL DEFAULT 'edit';
ALTER TABLE grocery_lists ADD COLUMN completed_at timestamptz;
