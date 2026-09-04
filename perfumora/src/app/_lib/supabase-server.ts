import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
   The storefront's single Supabase client — SERVER SIDE ONLY.

   Config comes from `.env` (see .env.example) and the names are deliberately
   *unprefixed*: Next only inlines `NEXT_PUBLIC_*` into the client bundle, so
   reading `SUPABASE_URL` here means this module cannot be used from a Client
   Component even by accident — the values simply aren't there. Every catalogue
   read happens in a Server Component, so nothing is lost by keeping them off
   the wire.

   (The admin panel is the mirror image: Vite inlines its `VITE_*` pair into the
   browser bundle by design. Both are safe because Row Level Security in
   perfumora-admin/supabase/schema.sql is the real boundary — the anon key
   grants `select` on active fragrances and their size rows, nothing more.)

   The storefront never signs anyone in, and there is no `localStorage` on the
   server, so both auth behaviours are off.

   We fail loudly on missing config rather than letting the catalogue query die
   with an opaque network error — or worse, render a shop with no products.
--------------------------------------------------------------------------- */

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase config. Copy .env.example to .env and set " +
      "SUPABASE_URL and SUPABASE_ANON_KEY, then restart the dev server. " +
      "(The VITE_-prefixed names are the admin panel's; Next ignores them.)",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
