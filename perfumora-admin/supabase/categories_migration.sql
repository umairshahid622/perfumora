-- ============================================================================
-- Perfumora — Categories Migration
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: every statement is guarded.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. categories table
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id         text        primary key,
  name       text        not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Seed initial categories: Male, Female, Unisex
-- ---------------------------------------------------------------------------

insert into categories (id, name) values
  ('male', 'Male'),
  ('female', 'Female'),
  ('unisex', 'Unisex')
on conflict (id) do update set name = excluded.name;

-- ---------------------------------------------------------------------------
-- 3. Link fragrances to categories
-- ---------------------------------------------------------------------------

alter table fragrances add column if not exists category_id text
  references categories(id) on delete set null;

create index if not exists fragrances_category_id_idx on fragrances (category_id);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security for categories
-- ---------------------------------------------------------------------------

alter table categories enable row level security;

-- Admin: full write access
drop policy if exists "admin full access" on categories;
create policy "admin full access" on categories
  for all to authenticated using (is_admin()) with check (is_admin());

-- Storefront & visitors: read-only access
drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 5. Randomly assign category to existing fragrances that have no category yet
-- ---------------------------------------------------------------------------

update fragrances
   set category_id = (
     select id from categories order by random() limit 1
   )
 where category_id is null;

-- ---------------------------------------------------------------------------
-- 6. Reload PostgREST schema cache
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
