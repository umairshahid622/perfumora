/// <reference types="vite/client" />

// Typed access to the Supabase settings read in src/lib/supabase.ts.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
