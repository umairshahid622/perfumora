import { supabase } from "./supabase";
import type { Fragrance, Order, OrderStatus, SizeKey, SizeMap } from "./types";
import { SIZE_KEYS, offeredSizes } from "./types";

/* ---------------------------------------------------------------------------
   Data access layer.

   Postgres columns are snake_case; the UI types are camelCase (and nest sizes /
   items). Every read goes through a mapper here so no component has to know
   the database's shape, and every write throws on failure so callers can show
   an error instead of silently doing nothing.

   Row types are hand-written rather than generated. If the schema grows, swap
   them for `supabase gen types typescript` output.
--------------------------------------------------------------------------- */

interface SizeRow {
  size: SizeKey;
  price: number;
  stock: number;
}

interface FragranceRow {
  id: string;
  name: string;
  image_url: string | null;
  color: string;
  description: string;
  active: boolean;
  fragrance_sizes: SizeRow[];
}

interface ItemRow {
  fragrance_id: string | null;
  fragrance_name: string;
  size: SizeKey;
  qty: number;
  price: number;
}

interface OrderRow {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  city: string;
  postal_code: string;
  billing_same: boolean;
  billing_address: string;
  billing_city: string;
  billing_postal_code: string;
  notes: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  order_items: ItemRow[];
}

/**
 * Collapse the `fragrance_sizes` rows into the map the UI works in.
 *
 * Sparse on purpose: a size with no row is a size we don't sell, so it stays
 * absent rather than becoming `{ price: 0, stock: 0 }`. Filling it in would
 * make a 30ml-only fragrance look like it also sells a free, sold-out 50ml.
 */
function toSizes(rows: SizeRow[]): SizeMap {
  const sizes: SizeMap = {};
  for (const row of rows) {
    if (SIZE_KEYS.includes(row.size)) {
      sizes[row.size] = { price: row.price, stock: row.stock };
    }
  }
  return sizes;
}

function toFragrance(row: FragranceRow): Fragrance {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url ?? "",
    color: row.color,
    description: row.description,
    active: row.active,
    sizes: toSizes(row.fragrance_sizes ?? []),
  };
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    shippingAddress: row.shipping_address,
    // Both are `not null default ''` in Postgres, but an order written before
    // those columns existed comes back without the keys at all.
    city: row.city ?? "",
    notes: row.notes ?? "",
    postalCode: row.postal_code ?? "",
    // `?? true` rather than false: a missing key means the order predates the billing
    // fields, and an order placed then had one address, which was both.
    billingSame: row.billing_same ?? true,
    billingAddress: row.billing_address ?? "",
    billingCity: row.billing_city ?? "",
    billingPostalCode: row.billing_postal_code ?? "",
    status: row.status,
    createdAt: row.created_at,
    total: row.total,
    items: (row.order_items ?? []).map((item) => ({
      fragranceId: item.fragrance_id ?? "",
      fragranceName: item.fragrance_name,
      size: item.size,
      qty: item.qty,
      price: item.price,
    })),
  };
}

/* ----------------------------- fragrances ------------------------------- */

// Nested select: one round trip brings each fragrance and its size rows.
const FRAGRANCE_SELECT =
  "id, name, image_url, color, description, active, fragrance_sizes ( size, price, stock )";

export async function fetchFragrances(): Promise<Fragrance[]> {
  const { data, error } = await supabase
    .from("fragrances")
    .select(FRAGRANCE_SELECT)
    .order("name");

  if (error) throw new Error(`Could not load fragrances: ${error.message}`);
  // The client has no generated Database type, so rows arrive untyped.
  return ((data ?? []) as unknown as FragranceRow[]).map(toFragrance);
}

/**
 * Create or replace a fragrance and the size rows it sells.
 *
 * Only offered sizes get a row, and sizes that were switched off get their row
 * deleted — otherwise dropping 50ml from a fragrance would leave the old row
 * behind and the storefront would happily keep selling it.
 *
 * This is up to three statements, not a transaction — the parent row can land
 * while the size writes fail. For a single-admin panel that's an acceptable
 * trade for not maintaining a Postgres function; the error message says which
 * part won.
 */
export async function upsertFragrance(fragrance: Fragrance): Promise<void> {
  const offered = offeredSizes(fragrance.sizes);

  // Guarded here as well as in the form: nothing downstream can price or sell a
  // fragrance with no sizes, and this is the last checkpoint before Postgres.
  if (offered.length === 0) {
    throw new Error(`${fragrance.name || "This fragrance"} needs at least one size.`);
  }

  const { error: fragranceError } = await supabase.from("fragrances").upsert({
    id: fragrance.id,
    name: fragrance.name,
    image_url: fragrance.imageUrl || null,
    color: fragrance.color,
    description: fragrance.description,
    active: fragrance.active,
  });

  if (fragranceError) {
    throw new Error(`Could not save ${fragrance.name}: ${fragranceError.message}`);
  }

  const { error: sizesError } = await supabase.from("fragrance_sizes").upsert(
    offered.map(({ size, variant }) => ({
      fragrance_id: fragrance.id,
      size,
      price: variant.price,
      stock: variant.stock,
    })),
  );

  if (sizesError) {
    throw new Error(
      `Saved ${fragrance.name}, but its prices and stock did not save: ${sizesError.message}`,
    );
  }

  const dropped = SIZE_KEYS.filter((size) => !fragrance.sizes[size]);
  if (dropped.length === 0) return;

  const { error: dropError } = await supabase
    .from("fragrance_sizes")
    .delete()
    .eq("fragrance_id", fragrance.id)
    .in("size", dropped);

  if (dropError) {
    throw new Error(
      `Saved ${fragrance.name}, but could not remove the sizes you switched off: ${dropError.message}`,
    );
  }
}

/** Sizes go with it: `fragrance_sizes` cascades on delete. */
export async function deleteFragrance(id: string): Promise<void> {
  const { error } = await supabase.from("fragrances").delete().eq("id", id);
  if (error) throw new Error(`Could not delete fragrance: ${error.message}`);
}

/** In / out of stock toggle — hides it from the storefront without deleting. */
export async function setFragranceActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("fragrances").update({ active }).eq("id", id);
  if (error) throw new Error(`Could not update availability: ${error.message}`);
}

/* -------------------------------- images -------------------------------- */

const IMAGE_BUCKET = "fragrance-images";

/**
 * Upload a picked file and hand back its public URL, which is what gets stored
 * in `fragrances.image_url`.
 *
 * Names are randomised rather than taken from the file, so re-uploading
 * "bottle.jpg" for a different fragrance can't overwrite the first one.
 */
export async function uploadFragranceImage(file: File): Promise<string> {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "jpg";
  const path = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw new Error(`Could not upload the image: ${error.message}`);

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/* -------------------------------- orders -------------------------------- */

const ORDER_SELECT =
  "id, customer_name, customer_email, customer_phone, shipping_address, city, " +
  "postal_code, notes, billing_same, billing_address, billing_city, " +
  "billing_postal_code, status, total, created_at, " +
  "order_items ( fragrance_id, fragrance_name, size, qty, price )";

/** Newest first — the dashboard and the list both want recent orders on top. */
export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load orders: ${error.message}`);
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) throw new Error(`Could not update order status: ${error.message}`);
}

