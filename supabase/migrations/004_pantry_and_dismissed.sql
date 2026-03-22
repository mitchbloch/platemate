-- Add dismissed column to grocery_list_items (for edit/shop mode + pantry auto-exclude)
alter table grocery_list_items
  add column dismissed boolean not null default false;

-- Pantry items — things the user always has at home (auto-dismissed from grocery lists)
create table pantry_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint pantry_items_name_unique unique (name)
);

alter table pantry_items enable row level security;

create policy "Authenticated users can do everything" on pantry_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
