-- Data integrity: recipe servings must be positive.
-- servings divides ingredient quantities when scaling grocery lists; a 0 or
-- negative value turns every derived quantity into NaN/Infinity.
UPDATE recipes SET servings = 1 WHERE servings < 1;
ALTER TABLE recipes ADD CONSTRAINT recipes_servings_positive CHECK (servings >= 1);
