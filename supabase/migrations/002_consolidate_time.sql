-- Consolidate prep_time_minutes + cook_time_minutes into total_time_minutes
alter table recipes add column total_time_minutes integer;

-- Migrate existing data: sum prep + cook into total
update recipes
set total_time_minutes = coalesce(prep_time_minutes, 0) + coalesce(cook_time_minutes, 0)
where prep_time_minutes is not null or cook_time_minutes is not null;

-- Drop old columns
alter table recipes drop column prep_time_minutes;
alter table recipes drop column cook_time_minutes;
