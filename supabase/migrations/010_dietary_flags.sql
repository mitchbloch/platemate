-- Add dietary_flags column to recipes
ALTER TABLE recipes ADD COLUMN dietary_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
