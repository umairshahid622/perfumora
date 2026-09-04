import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
   The signed-in customer's Supabase client — the anon key plus an identity.

   Third client in the storefront, and the only one that knows who is asking.
   `supabase-server.ts` is deliberately sessionless: the catalogue is the same
   for every visitor, so it queries as `anon` and the `to anon` read policies
   cover it — which is also why signing in cannot change what the shop shows.
   `supabase-admin.ts` outranks the policies entirely and exists for the order
   write alone. This one sits between them: the same anon key, carrying the
   customer's tokens out of the request's cookies, so Postgres resolves
   `auth.uid()` and the own-rows-only policies in
   perfumora-admin/supabase/schema.sql do the scoping instead of our code.

   Cookies rather than `localStorage`, which is the whole reason for the
   `@supabase/ssr` dependency: plain `@supabase/supabase-js` keeps its session in
   browser storage, and a Server Action cannot read browser storage. Since every
   write in this app is a Server Action (`orders.ts`, `auth.ts`), a session the
   server cannot see would be a session that cannot place an order in the
   customer's name. `@supabase/ssr` is that same client with cookie storage
   swapped in.

   Built per call and never memoised, unlike `supabaseAdmin()`. The session lives
   in one request's cookies, so a module-scope client would hand the first
   visitor's identity to the second.

   No new environment names: this reads the same unprefixed pair as
   `supabase-server.ts`, so nothing here can reach the browser by construction —
   a Client Component that imported this module would find neither the values nor
   `next/headers`.
--------------------------------------------------------------------------- */

/** The cookie-backed anon client for this request. Throws by name if unset. */
export async function supabaseAuth(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY in " +
        ".env, then restart the dev server. Signing a customer in needs the " +
        "same anon pair the catalogue is read with.",
    );
  }

  const store = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (written) => {
        try {
          for (const { name, value, options } of written) {
            store.set(name, value, options);
          }
        } catch {
          // Cookies may only be written from a Server Action or Route Handler;
          // `set` throws during a Server Component render. Swallowing it is
          // correct rather than lazy, because the only thing that reaches here
          // from a render is a token refresh — and `proxy.ts` has already
          // performed that same refresh, and written it, before the render
          // began. A sign-in or sign-out is always a Server Action, so its
          // cookies are never the ones dropped.
        }
      },
    },
  });
}
