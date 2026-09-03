import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
   The single Supabase client for the app.

   Config comes from `.env` (see .env.example). Vite only exposes variables
   prefixed `VITE_`, and inlines them at build time — so the anon key ends up in
   the bundle. That's expected: it's a public key, and Row Level Security in
   supabase/schema.sql is what actually protects the data.

   We fail loudly on a missing config rather than letting every query die with
   an opaque network error.
--------------------------------------------------------------------------- */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase config. Copy .env.example to .env and set " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Keep the admin signed in across refreshes and renew tokens in the
    // background, so a long session in the panel doesn't expire mid-edit.
    persistSession: true,
    autoRefreshToken: true,
  },
});
