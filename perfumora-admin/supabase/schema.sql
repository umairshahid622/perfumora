-- ============================================================================
-- Perfumora Admin — Supabase schema
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: every statement is guarded.
--
-- SECURITY NOTE: the anon key shipped in the client bundle is public by
-- design — Row Level Security below is the real boundary. Admin rights come
-- from a row in `user_roles`, NOT from merely being signed in, so public
-- sign-ups are safe to leave on: a new account is a customer, and a customer
-- can read its own orders and nothing else. Becoming staff is a deliberate act
-- — the seeding block below, which you must edit before this file will run.
--
-- PostgREST answers from a cached schema, so after changing anything here run
-- `notify pgrst, 'reload schema';` — the last statement in this file. A
-- function it hasn't cached comes back as 404 PGRST202 however correct the SQL.
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

do $$ begin
  create type user_role as enum ('admin', 'customer');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- user_roles — who is staff, and who is a shopper.
--
-- An EXCEPTIONS table: a row exists only to record a role granted on purpose.
-- No row means customer, so a brand-new sign-up holds the least privilege there
-- is without anything having to run on its behalf — which is why there is
-- deliberately no trigger on auth.users here. A trigger that threw would break
-- sign-up itself, and all it could write is the default already assumed.
-- ---------------------------------------------------------------------------

create table if not exists user_roles (
  user_id uuid      primary key references auth.users(id) on delete cascade,
  role    user_role not null default 'customer'
);

-- `security definer` so a policy can consult user_roles without user_roles
-- itself needing a policy that lets everyone read it; `stable` so Postgres may
-- call it once per statement rather than once per row; search_path pinned for
-- the same reason place_order pins it.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_roles where user_id = auth.uid() and role = 'admin'
  )
$$;

-- >>> EDIT THIS: your admin address, exactly as it appears under Dashboard →
-- Authentication → Users. Without it every policy below locks you out of your
-- own panel, so this block refuses to run rather than letting that happen
-- quietly — RLS does not raise a permission error, it just returns no rows, and
-- an empty Orders page is a miserable thing to debug.
do $$
declare
  v_email text := 'shahidumair622@gmail.com';
  v_id    uuid;
begin
  select id into v_id from auth.users where email = v_email;
  if v_id is null then
    raise exception
      'No auth user with email %. Set v_email in this block to your admin address (Dashboard → Authentication → Users), then re-run this file.', v_email;
  end if;

  insert into user_roles (user_id, role) values (v_id, 'admin')
  on conflict (user_id) do update set role = 'admin';
end $$;

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

-- Re-runnable upgrade: the storefront checkout collects a city and delivery
-- notes, which earlier copies of this schema had nowhere to put. `default ''`
-- like `customer_phone`, so rows written before this ran stay valid.
alter table orders add column if not exists city  text not null default '';
alter table orders add column if not exists notes text not null default '';

-- Re-runnable upgrade: which account placed the order, when one did. Null is the
-- normal case — guest checkout needs no sign-in — and `on delete set null` means
-- removing a customer never removes the sale.
alter table orders add column if not exists user_id uuid
  references auth.users(id) on delete set null;

-- Re-runnable upgrade: the postal code beside the city, and a billing address held
-- apart from the shipping one. Two things worth stating outright:
--
--   - `billing_same` records what the customer declared rather than being inferred
--     later by comparing two free-text blobs, which whitespace alone would break;
--   - the billing columns are filled either way — copied from shipping when they
--     said "same" (orders.ts) — for the reason `total` is stored rather than
--     derived: the row is the order as it was placed, and a reader (this panel
--     today, an invoice later) shouldn't have to know a fallback rule.
--
-- Neither is required at checkout, so both default to the empty string like
-- `city` and `notes` above.
alter table orders add column if not exists postal_code text not null default '';
alter table orders add column if not exists billing_same boolean not null default true;
alter table orders add column if not exists billing_address text not null default '';
alter table orders add column if not exists billing_city text not null default '';
alter table orders add column if not exists billing_postal_code text not null default '';

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
create index if not exists orders_user_id_idx        on orders (user_id, created_at desc);
create index if not exists fragrances_active_idx     on fragrances (active);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table fragrances      enable row level security;
alter table fragrance_sizes enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table user_roles      enable row level security;

-- Admin: full control, granted by `is_admin()` rather than by the bare fact of
-- holding a session. That distinction is the point of this whole section — a
-- customer carries an `authenticated` token too.
drop policy if exists "admin full access" on fragrances;
create policy "admin full access" on fragrances
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin full access" on fragrance_sizes;
create policy "admin full access" on fragrance_sizes
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin full access" on orders;
create policy "admin full access" on orders
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin full access" on order_items;
create policy "admin full access" on order_items
  for all to authenticated using (is_admin()) with check (is_admin());

-- Customers: their own orders, read-only. Postgres ORs permissive policies
-- together, so these sit beside the admin ones rather than competing with them —
-- an admin still sees every row, a customer only rows carrying their id. Both are
-- `for select`, so neither grants a customer a single write.
drop policy if exists "customer read own orders" on orders;
create policy "customer read own orders" on orders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "customer read own order items" on order_items;
create policy "customer read own order items" on order_items
  for select to authenticated using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- Roles: read your own, and only an admin hands one out. No insert, update or
-- delete for a customer anywhere — being able to write this table is being able
-- to make yourself staff.
drop policy if exists "read own role" on user_roles;
create policy "read own role" on user_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admin manage roles" on user_roles;
create policy "admin manage roles" on user_roles
  for all to authenticated using (is_admin()) with check (is_admin());

-- Storefront: read-only, and only what's on sale. `anon, authenticated` covers a
-- visitor and a signed-in customer alike — a customer's token is `authenticated`,
-- so naming only `anon` here would hand every logged-in shopper an empty shop now
-- that "admin full access" no longer catches them.
--
-- Orders stay invisible to anon entirely. A guest checkout reaches them through
-- place_order with the service-role key (perfumora/src/app/_lib/orders.ts), never
-- from the browser.
drop policy if exists "public read active fragrances" on fragrances;
create policy "public read active fragrances" on fragrances
  for select to anon, authenticated using (active = true);

drop policy if exists "public read active fragrance sizes" on fragrance_sizes;
create policy "public read active fragrance sizes" on fragrance_sizes
  for select to anon, authenticated using (
    exists (
      select 1 from fragrances f
      where f.id = fragrance_sizes.fragrance_id and f.active
    )
  );

-- ---------------------------------------------------------------------------
-- Storage — fragrance images
--
-- Public-read so both the panel and the storefront can use a plain <img src>;
-- writes stay behind the same `is_admin()` check as the tables above, so a
-- signed-in customer cannot replace or delete your product photography.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fragrance-images', 'fragrance-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read fragrance images" on storage.objects;
create policy "public read fragrance images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'fragrance-images');

drop policy if exists "admin upload fragrance images" on storage.objects;
create policy "admin upload fragrance images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fragrance-images' and is_admin());

drop policy if exists "admin replace fragrance images" on storage.objects;
create policy "admin replace fragrance images" on storage.objects
  for update to authenticated
  using (bucket_id = 'fragrance-images' and is_admin());

drop policy if exists "admin delete fragrance images" on storage.objects;
create policy "admin delete fragrance images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fragrance-images' and is_admin());

-- ---------------------------------------------------------------------------
-- place_order — the storefront's one write.
--
-- Customer checkout has no login, so it reaches the database through a Next.js
-- Server Action holding the service-role key (perfumora/src/app/_lib/orders.ts).
-- That action is a public HTTP endpoint, which is why this function is handed
-- only WHAT was ordered — fragrance, size, quantity — and looks up every price
-- itself. A forged payload cannot name its own price.
--
-- The whole body is one transaction: any `raise` below discards the order row,
-- its line items and every stock decrement together. That is what makes the
-- decrement safe when two customers reach for the last bottle at once.
--
-- Raised messages carry machine-readable prefixes (`OUT_OF_STOCK:`,
-- `UNAVAILABLE:`, `EMPTY_ORDER`, `BAD_QTY`); orders.ts turns those into
-- sentences a customer can act on, and hides anything else behind one generic
-- line rather than showing internals to a shopper.
--
-- Returns the total it computed — the figure the confirmation screen shows.
-- ---------------------------------------------------------------------------

-- Superseded signatures have to go rather than be replaced: `create or replace`
-- cannot change an argument list, so a shorter one left behind would not be
-- overwritten but kept as a second overload — a live path that writes orders with
-- no owner and no billing address, and an ambiguity for PostgREST to resolve.
drop function if exists place_order(text,text,text,text,text,text,jsonb);
drop function if exists place_order(text,text,text,text,text,text,jsonb,uuid);

create or replace function place_order(
  p_id text, p_name text, p_phone text, p_address text,
  p_city text, p_notes text, p_lines jsonb,
  -- Who placed it, or null for a guest — still the normal path. Defaulted so this
  -- file and the storefront need not deploy in step: PostgREST resolves an RPC by
  -- argument name, and a parameter with no default would make a call that omits
  -- it fail to match the function at all.
  p_user_id uuid default null,
  -- The postal code and the billing address, both optional at checkout and both
  -- defaulted for the same deploy-order reason as `p_user_id`. Pass-through, like
  -- every other customer field here: the copy-when-"same" rule and the bounding of
  -- these strings live in orders.ts beside the rest of the cleaning.
  p_postal_code text default '',
  p_billing_same boolean default true,
  p_billing_address text default '',
  p_billing_city text default '',
  p_billing_postal_code text default ''
) returns integer
language plpgsql
-- Pinned, so an unqualified name below can't be resolved through a caller's
-- search_path to some other table.
set search_path = public
as $$
declare
  v_line jsonb; v_id text; v_size bottle_size; v_qty int;
  v_price int; v_stock int; v_name text; v_total int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  -- Inserted at 0 and corrected at the end: the total is the sum of the prices
  -- read below, and there is nothing to sum until the loop has run.
  insert into orders (id, customer_name, customer_phone,
                      shipping_address, city, postal_code, notes, total, user_id,
                      billing_same, billing_address, billing_city,
                      billing_postal_code)
  values (p_id, p_name, p_phone, p_address, p_city, p_postal_code, p_notes, 0,
          p_user_id, p_billing_same, p_billing_address, p_billing_city,
          p_billing_postal_code);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_id   := v_line->>'fragrance_id';
    v_size := (v_line->>'size')::bottle_size;
    v_qty  := (v_line->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'BAD_QTY'; end if;

    -- Locked here and held until this function returns, so the check below
    -- cannot be overtaken between reading the stock and decrementing it.
    select fs.price, fs.stock into v_price, v_stock
      from fragrance_sizes fs
     where fs.fragrance_id = v_id and fs.size = v_size
       for update;
    if not found then raise exception 'UNAVAILABLE:%', v_id; end if;

    -- The name is denormalized onto the line item, and `active` is re-checked
    -- while we're here: the storefront only offers active fragrances, but a
    -- forged POST needn't.
    select name into v_name from fragrances where id = v_id and active;
    if not found then raise exception 'UNAVAILABLE:%', v_id; end if;

    if v_stock < v_qty then
      raise exception 'OUT_OF_STOCK:% %', v_name, v_size;
    end if;

    update fragrance_sizes set stock = stock - v_qty
     where fragrance_id = v_id and size = v_size;

    insert into order_items (order_id, fragrance_id, fragrance_name, size, qty, price)
    values (p_id, v_id, v_name, v_size, v_qty, v_price);

    v_total := v_total + v_price * v_qty;
  end loop;

  update orders set total = v_total where id = p_id;
  return v_total;
end $$;

-- Only the service-role key may call this. Two revokes, not one: Postgres grants
-- execute to `public` by default, and Supabase's default privileges on this schema
-- then grant it to `anon` and `authenticated` by name — an explicit grant that a
-- revoke aimed at PUBLIC leaves standing. Either caller would have got nowhere
-- anyway (the function runs as its invoker, so the policies above still apply to
-- them and the first insert aborts the transaction), but failing closed is not the
-- same as being unreachable, and this is a public POST endpoint.
revoke all on function place_order(text,text,text,text,text,text,jsonb,uuid,
  text,boolean,text,text,text) from public;
revoke execute on function place_order(text,text,text,text,text,text,jsonb,uuid,
  text,boolean,text,text,text) from anon, authenticated;
grant execute on function place_order(text,text,text,text,text,text,jsonb,uuid,
  text,boolean,text,text,text) to service_role;

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

-- Last, and not optional: PostgREST serves the REST and RPC endpoints from a
-- cached picture of the schema, and it will report a function it hasn't cached as
-- 404 PGRST202 no matter how correct the SQL above is.
notify pgrst, 'reload schema';
