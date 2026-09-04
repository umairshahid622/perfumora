import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
   The service-role Supabase client — THIS BYPASSES ROW LEVEL SECURITY.

   Imported by `orders.ts` and nothing else, ever. Placing an order has to write
   `orders`, `order_items` and `fragrance_sizes`, and RLS grants `anon` none of
   those on purpose (perfumora-admin/supabase/schema.sql): a checkout with no
   login can only reach the database through a key that outranks the policies.
   Every other read stays on the anon client in `supabase-server.ts`, which the
   policies still police.

   `SUPABASE_SERVICE_ROLE_KEY` is unprefixed for the same reason the anon pair
   is: Next inlines only `NEXT_PUBLIC_*` into the client bundle, so this value
   cannot reach a browser by construction. Never rename it with that prefix.

   Built lazily inside the getter rather than at module scope, which is the one
   way this differs from `supabase-server.ts`. The anon pair is needed to render
   every page, so failing at import there is honest. This key is needed only to
   place an order, and a module-scope throw would fail the whole `/checkout`
   route — including the form and the empty-cart state — merely because the key
   hadn't been pasted in yet.
--------------------------------------------------------------------------- */

let client: SupabaseClient | null = null;

/** The service-role client, created on first use. Throws by name if unset. */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase service-role config. Set SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Project Settings → " +
        "API keys → service_role), then restart the dev server. Orders cannot " +
        "be written with the anon key.",
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
