-- ============================================================================
-- Perfumora Admin — Supabase schema
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: every statement is guarded.
--
-- SECURITY NOTE: the anon key shipped in the client bundle is public by
-- design — Row Level Security below is the real boundary. Because the admin
-- policies grant full access to ANY signed-in user, you MUST disable public
-- sign-ups (Dashboard → Authentication → Sign In / Providers → uncheck
-- "Allow new users to sign up") and create your admin user by hand. Otherwise
-- anyone who registers gets write access to your catalog and orders.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums — keep bad values out at the database level.
-- ---------------------------------------------------------------------------

do $$ begin
  create type order_status as enum ('pending', 'processing', 'delivered', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bottle_size as enum ('30ml', '50ml');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- fragrances — one row per SKU.
-- ---------------------------------------------------------------------------

create table if not exists fragrances (
  id          text        primary key,
  name        text        not null,
  image_url   text,
  color       text        not null default '#8c6a4a',
  description text        not null default '',
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fragrance_sizes — price + stock per size.
--
-- One row per size a fragrance is ACTUALLY SOLD IN. Most come in both 30ml and
-- 50ml, but some are 30ml only and some 50ml only, so this is a child table
-- rather than two column pairs on `fragrances`: a 30ml-only fragrance simply
-- has one row. The composite PK allows at most one row per size, and a stock
-- edit touches exactly one row.
--
-- The presence of a row is what "we sell this size" means. That's why `price`
-- must be > 0: a row that exists is on sale, and a bottle on sale for nothing
-- is a data-entry mistake, not a free gift. "Sold but out of stock" is
-- `stock = 0` on an existing row — a different state from having no row, and
-- the storefront must treat them differently (show as unavailable vs. hide).
--
-- Prices and totals are whole PKR rupees (no minor unit), so integer is right.
--
-- NOTE: "every fragrance sells at least one size" is NOT enforced here. It
-- spans two tables, so a CHECK can't express it, and a deferred constraint
-- trigger would reject the parent insert in the app's insert-then-add-sizes
-- write order. It's enforced in the form and again in upsertFragrance()
-- (src/lib/api.ts); the audit query at the bottom of this file finds any that
-- slipped through.
-- ---------------------------------------------------------------------------

create table if not exists fragrance_sizes (
  fragrance_id text        not null references fragrances(id) on delete cascade,
  size         bottle_size not null,
  price        integer     not null check (price > 0),
  stock        integer     not null default 0 check (stock >= 0),
  primary key (fragrance_id, size)
);

-- Re-runnable upgrade: older copies of this schema allowed price = 0, which
-- couldn't be told apart from "size not sold". Tighten it in place.
do $$ begin
  alter table fragrance_sizes drop constraint if exists fragrance_sizes_price_check;
  alter table fragrance_sizes add  constraint fragrance_sizes_price_check
    check (price > 0);
exception when check_violation then
  raise exception 'Some fragrance_sizes rows have price = 0. Fix or delete them, then re-run: select * from fragrance_sizes where price = 0;';
end $$;

-- ---------------------------------------------------------------------------
-- orders — customer + shipping + status. `total` is stored rather than derived
-- so historical orders stay correct if prices later change.
-- ---------------------------------------------------------------------------

create table if not exists orders (
  id               text         primary key,
  customer_name    text         not null,
  customer_email   text         not null default '',
  customer_phone   text         not null default '',
  shipping_address text         not null default '',
  status           order_status not null default 'pending',
  total            integer      not null default 0 check (total >= 0),
  created_at       timestamptz  not null default now()
);

-- ---------------------------------------------------------------------------
-- order_items — one row per fragrance+size line on an order.
--
-- `fragrance_name` and `price` are deliberately denormalized: they capture what
-- the customer actually saw and paid, so renaming or repricing a fragrance
-- never rewrites history. `fragrance_id` goes null (not cascade-delete) if the
-- fragrance is removed, keeping the line item intact.
-- ---------------------------------------------------------------------------

create table if not exists order_items (
  id             bigint      generated always as identity primary key,
  order_id       text        not null references orders(id) on delete cascade,
  fragrance_id   text        references fragrances(id) on delete set null,
  fragrance_name text        not null,
  size           bottle_size not null,
  qty            integer     not null check (qty > 0),
  price          integer     not null check (price >= 0)
);

-- Indexes for the queries the admin panel actually runs.
create index if not exists order_items_order_id_idx on order_items (order_id);
create index if not exists orders_status_idx         on orders (status);
create index if not exists orders_created_at_idx     on orders (created_at desc);
create index if not exists fragrances_active_idx     on fragrances (active);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table fragrances      enable row level security;
alter table fragrance_sizes enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;

-- Admin: any signed-in user gets full control. See the security note at the
-- top — this is only safe with public sign-ups disabled.
drop policy if exists "admin full access" on fragrances;
create policy "admin full access" on fragrances
  for all to authenticated using (true) with check (true);

drop policy if exists "admin full access" on fragrance_sizes;
create policy "admin full access" on fragrance_sizes
  for all to authenticated using (true) with check (true);

drop policy if exists "admin full access" on orders;
create policy "admin full access" on orders
  for all to authenticated using (true) with check (true);

drop policy if exists "admin full access" on order_items;
create policy "admin full access" on order_items
  for all to authenticated using (true) with check (true);

-- Storefront (anonymous visitors): read-only, and only what's on sale.
-- Orders stay invisible to anon entirely — customer checkout should insert via
-- an Edge Function using the service-role key, not from the browser.
drop policy if exists "public read active fragrances" on fragrances;
create policy "public read active fragrances" on fragrances
  for select to anon using (active = true);

drop policy if exists "public read active fragrance sizes" on fragrance_sizes;
create policy "public read active fragrance sizes" on fragrance_sizes
  for select to anon using (
    exists (
      select 1 from fragrances f
      where f.id = fragrance_sizes.fragrance_id and f.active
    )
  );

-- ---------------------------------------------------------------------------
-- Storage — fragrance images
--
-- Public-read so both the panel and the storefront can use a plain <img src>;
-- writes stay behind the same signed-in check as the tables above.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fragrance-images', 'fragrance-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read fragrance images" on storage.objects;
create policy "public read fragrance images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'fragrance-images');

drop policy if exists "admin upload fragrance images" on storage.objects;
create policy "admin upload fragrance images" on storage.objects
  for insert to authenticated with check (bucket_id = 'fragrance-images');

drop policy if exists "admin replace fragrance images" on storage.objects;
create policy "admin replace fragrance images" on storage.objects
  for update to authenticated using (bucket_id = 'fragrance-images');

drop policy if exists "admin delete fragrance images" on storage.objects;
create policy "admin delete fragrance images" on storage.objects
  for delete to authenticated using (bucket_id = 'fragrance-images');

-- ---------------------------------------------------------------------------
-- Audit — the one invariant the database can't enforce itself.
--
-- A fragrance with no size rows has no price and can't be bought; it shows up
-- in the panel as "No sizes set". Run this now and then (or after a bulk
-- import) to catch any. Nothing here is created — it's a query to copy.
--
--   select f.id, f.name
--   from fragrances f
--   left join fragrance_sizes s on s.fragrance_id = f.id
--   where s.fragrance_id is null
--   order by f.name;
--
-- ---------------------------------------------------------------------------
