import { cache } from "react";
import { supabase } from "./supabase-server";
import { contrastToken, type SizeMap, type SizeMl, type Variant } from "./variants";

/* ---------------------------------------------------------------------------
   The catalogue read — the storefront's only conversation with the database.

   Postgres columns are snake_case and its sizes are text (`'30ml'`); the UI
   works in camelCase and numeric millilitres. Every row goes through a mapper
   here so no component has to know the database's shape, exactly as the admin
   panel does it (perfumora-admin/src/lib/api.ts).

   Row types are hand-written rather than generated. If the schema grows, swap
   them for `supabase gen types typescript` output.

   Server-only: `supabase-server` reads unprefixed env vars, which do not exist
   in the browser bundle.
--------------------------------------------------------------------------- */

interface SizeRow {
  size: "30ml" | "50ml";
  price: number;
  stock: number;
}

interface FragranceRow {
  id: string;
  name: string;
  color: string;
  fragrance_sizes: SizeRow[];
}

/** The one place the database's `bottle_size` enum meets the UI's `SizeMl`. */
const SIZE_FROM_DB: Record<string, SizeMl> = { "30ml": 30, "50ml": 50 };

/** The same crossing in the other direction, for the order write in `orders.ts`:
 *  it has to name a value the `bottle_size` enum will accept. Exported so that
 *  crossing still happens in exactly one module. */
export const SIZE_TO_DB: Record<SizeMl, string> = { 30: "30ml", 50: "50ml" };

/**
 * Collapse the `fragrance_sizes` rows into the sparse map the UI works in — see
 * `SizeMap` for why absent beats zero-filled. An unrecognised enum value is
 * skipped rather than crashing the page: if someone adds a `100ml` to the
 * database before the storefront learns about it, the rest of the shop still
 * renders.
 */
function toSizes(rows: SizeRow[]): SizeMap {
  const sizes: SizeMap = {};
  for (const row of rows) {
    const ml = SIZE_FROM_DB[row.size];
    if (ml) sizes[ml] = { price: row.price, stock: row.stock };
  }
  return sizes;
}

function toVariant(row: FragranceRow): Variant {
  return {
    id: row.id,
    name: row.name,
    hex: row.color,
    // Derived, not stored: the database holds one colour per fragrance and every
    // other colour on the page — the readable foregrounds, the glow, the 3D
    // juice, this label token — is computed from it in `variants.ts`.
    contrast: contrastToken(row.color),
    sizes: toSizes(row.fragrance_sizes ?? []),
  };
}

// Nested select: one round trip brings each fragrance and its size rows.
const FRAGRANCE_SELECT = "id, name, color, fragrance_sizes ( size, price, stock )";

/**
 * Every fragrance the shop currently sells, in the order the catalogue was built.
 *
 * Wrapped in React's `cache`, so the root layout (which seeds `<ScentProvider>`)
 * and `/collection` (which renders the full grid) share one query per request
 * instead of making the same round trip twice.
 *
 * Ordered by `created_at` rather than by name as the admin panel does: here the
 * order is *editorial* — it sets the sequence the Hero's arrows walk and which
 * fragrances the home Gallery teases — and insert order is the closest thing to
 * an intended order the schema offers.
 *
 * `.eq("active", true)` is belt-and-braces. Row Level Security already restricts
 * `anon` to active rows (schema.sql), but an invisible policy is a poor way to
 * express intent at the call site, and it costs nothing to say it out loud.
 */
export const getCatalogue = cache(async (): Promise<Variant[]> => {
  const { data, error } = await supabase
    .from("fragrances")
    .select(FRAGRANCE_SELECT)
    .eq("active", true)
    .order("created_at");

  if (error) throw new Error(`Could not load the catalogue: ${error.message}`);

  // A fragrance with no size rows has no price and cannot be bought — it is the
  // "No sizes set" state the panel warns about, and the case schema.sql's own
  // audit query exists to find. Dropping it here is what lets every component
  // downstream assume a variant has at least one price.
  const variants = ((data ?? []) as unknown as FragranceRow[])
    .map(toVariant)
    .filter((variant) => Object.keys(variant.sizes).length > 0);

  // Loud rather than blank. An empty catalogue means the query succeeded and the
  // shop has nothing to sell — a wrong deploy, an empty database, or every
  // fragrance switched off — and a storefront rendering zero products with no
  // explanation is the worst possible way to find that out.
  if (variants.length === 0) {
    throw new Error(
      "The catalogue is empty: no active fragrance has a price for any size. " +
        "Check the fragrances table and that each row sells at least one size.",
    );
  }

  return variants;
});
