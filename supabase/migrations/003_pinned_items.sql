-- Pinned grocery items — staples that auto-appear on every week's list
create table pinned_grocery_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text not null default 'other',
  store text not null default 'trader-joes',
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

-- RLS: shared household (same pattern as other tables)
alter table pinned_grocery_items enable row level security;

create policy "Authenticated users can do everything" on pinned_grocery_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
