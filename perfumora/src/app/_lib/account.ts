import { supabaseAuth } from "./supabase-auth";

/* ---------------------------------------------------------------------------
   The customer's own orders — the storefront's one read that depends on who is
   asking.

   `catalogue.ts` queries as `anon`, because the shop is the same for every
   visitor. This goes through `supabaseAuth()`, the cookie-backed client, so
   Postgres resolves `auth.uid()` and the `customer read own orders` policy in
   perfumora-admin/supabase/schema.sql does the scoping instead of our code.
   Never `supabaseAdmin()`: that key outranks every policy, so one wrong filter
   there would serve a customer somebody else's order history.

   Server-only by construction — `supabase-auth` reads `next/headers` and the
   unprefixed env pair, neither of which exists in the browser. Deliberately not
   a `"use server"` module either: nothing calls this from a click handler, and
   marking it so would publish an HTTP endpoint for a read the Server Component
   already has in hand.

   Row types are hand-written, as in `catalogue.ts`. If the schema grows, swap
   them for `supabase gen types typescript` output.
--------------------------------------------------------------------------- */

/** The `order_status` enum, as the admin panel also spells it. `canceled` sits
 *  outside the pending → processing → delivered flow rather than after it. */
export type OrderStatus = "pending" | "processing" | "delivered" | "canceled";

/** One line of a placed order. `name` and `unitPrice` are the denormalized
 *  columns — what the customer actually saw and agreed to — so renaming or
 *  repricing a fragrance never rewrites their receipt. */
export interface AccountOrderLine {
  id: number;
  name: string;
  /** The `bottle_size` value verbatim (`"30ml"`). Unlike the catalogue read there
   *  is nothing to cross into `SizeMl`: nothing here does size arithmetic, and a
   *  size added to the enum later should print itself rather than vanish. */
  size: string;
  unitPrice: number;
  quantity: number;
}

export interface AccountOrder {
  /** The `PRF-…` reference the customer quotes back — `orders.id` itself, minted
   *  by `orderReference()` at the moment the order was placed. */
  reference: string;
  /** ISO 8601, from `orders.created_at`. */
  placedAt: string;
  status: OrderStatus;
  /** Integer PKR as stored, not summed from `lines`: the row is the order as it
   *  was placed, and this is the figure the courier collects. */
  total: number;
  lines: AccountOrderLine[];
}

interface ItemRow {
  id: number;
  fragrance_name: string;
  size: string;
  qty: number;
  price: number;
}

interface OrderRow {
  id: string;
  created_at: string;
  status: OrderStatus;
  total: number;
  order_items: ItemRow[];
}

function toOrder(row: OrderRow): AccountOrder {
  return {
    reference: row.id,
    placedAt: row.created_at,
    status: row.status,
    total: row.total,
    // Sorted rather than taken as they arrive: PostgREST promises no order for an
    // embedded table, and these are the lines of a receipt. The identity column
    // ascends in the order `place_order` inserted them, which is the order the
    // bag was reviewed in.
    lines: [...(row.order_items ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((item) => ({
        id: item.id,
        name: item.fragrance_name,
        size: item.size,
        unitPrice: item.price,
        quantity: item.qty,
      })),
  };
}

// Nested select: one round trip brings each order and its lines.
const ORDER_SELECT =
  "id, created_at, status, total, order_items ( id, fragrance_name, size, qty, price )";

/**
 * Every order the signed-in customer has placed, newest first — or `null` when
 * nobody is signed in.
 *
 * `null` rather than `[]` for a visitor, because the two are not the same outcome:
 * `null` is what `/orders` turns into a redirect home, while `[]` is the page saying
 * you haven't ordered yet. The query alone cannot tell them apart — with no session
 * `auth.uid()` is null, so the policy matches nothing and an empty list is exactly
 * what a signed-out request gets.
 *
 * `getUser()` rather than `getSession()`, matching `currentCustomer()`: it asks
 * the auth server to validate the token instead of believing what the cookie
 * says about itself.
 *
 * Guest orders are not here and cannot be: `placeOrder` stamps `user_id` from the
 * session at the time, so an order placed before signing up carries no id to
 * match on. Reuniting those with an account is a decision about identity — a
 * phone number is guessable — not a filter.
 */
export async function getMyOrders(): Promise<AccountOrder[] | null> {
  const supabase = await supabaseAuth();
  const { data: account } = await supabase.auth.getUser();
  const user = account.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    // Load-bearing, unlike the catalogue read's `.eq("active", true)`. RLS ORs its
    // permissive policies together, so a signed-in *admin* is caught by "admin
    // full access" as well and would otherwise read every order in the shop into
    // their own account page. For a customer this restates what the policy
    // already enforces; for an admin it is the whole of the scoping.
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Loud rather than blank, as in `catalogue.ts`. A failed read rendered as an
  // empty list would be indistinguishable from "you have never ordered", which is
  // the one thing this page must not say wrongly.
  if (error) throw new Error(`Could not load your orders: ${error.message}`);

  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}
