"use server";

import { revalidatePath } from "next/cache";
import { SIZE_TO_DB } from "./catalogue";
import { orderReference, type CustomerDetails } from "./checkout";
import { supabaseAdmin } from "./supabase-admin";
import type { SizeMl } from "./variants";

/* ---------------------------------------------------------------------------
   Placing an order — the storefront's only write.

   A `"use server"` module, so <Checkout> can `await placeOrder(...)` straight
   from its click handler. What that means for this file: the export below is a
   public HTTP endpoint, reachable by POST from anywhere and not only through our
   own UI, with no customer login to check. So nothing arriving here is trusted:

     - the payload names WHAT was ordered, never what it costs. `place_order`
       (perfumora-admin/supabase/schema.sql) reads every price out of
       `fragrance_sizes` itself, which is what stops a forged body buying a
       bottle for one rupee;
     - the form's `required` attributes protect the form, not this, so the fields
       are re-checked and bounded below;
     - the whole write is one `rpc()` into one plpgsql function, hence one
       transaction: the order row, its line items and every stock decrement land
       together or not at all.

   The reference is minted here rather than in the browser, because it is the
   order's primary key and a key the client picks is a key the client can pick
   twice.
--------------------------------------------------------------------------- */

/** One SKU as the browser reports it. Deliberately carries no price. */
interface OrderLineInput {
  variantId: string;
  size: SizeMl;
  qty: number;
}

type PlaceOrderResult =
  | { ok: true; reference: string; total: number }
  | { ok: false; message: string };

/** Ceilings, not preferences: the text columns are unbounded, so without these a
 *  forged body could write a megabyte of "city" into the admin panel. */
const LIMITS = { name: 120, phone: 40, address: 400, city: 80, notes: 500 };
const MAX_LINES = 24;
const MAX_QTY = 20;

/** Shown when we cannot explain the failure — the real message can name a table
 *  or a missing env var, so it goes to the server log instead. */
const GENERIC = "We could not place your order just now. Please try again.";
const REBUILD = "That order did not look right. Please rebuild your bag and try again.";

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/**
 * Turn one of `place_order`'s raised messages into a sentence the customer can
 * act on, or `null` when it isn't ours to translate. Only the two states a
 * shopper can actually fix are spoken; everything else stays opaque on purpose.
 */
function explain(raw: string): string | null {
  const soldOut = raw.indexOf("OUT_OF_STOCK:");
  if (soldOut !== -1) {
    const sku = raw.slice(soldOut + "OUT_OF_STOCK:".length).trim();
    return `${sku} just sold out — remove it from your bag to continue.`;
  }
  if (raw.includes("UNAVAILABLE:")) {
    return "One of the fragrances in your bag is no longer available — remove it to continue.";
  }
  return null;
}

/**
 * Write the order, decrement the stock, and hand back the reference and the total
 * the database computed.
 *
 * That total is the database's, not the reviewed one: it is summed from the prices
 * held at order time, so if a bottle was repriced while it sat in the bag, the
 * confirmation shows what the courier will actually collect.
 *
 * Never throws. A failure comes back as `{ ok: false }` with a sentence to show,
 * because the caller is a click handler on a step the customer is still standing
 * on — the bag has to survive so they can fix it and retry.
 */
export async function placeOrder(
  details: CustomerDetails,
  lines: readonly OrderLineInput[],
): Promise<PlaceOrderResult> {
  const customer = {
    name: clean(details?.name, LIMITS.name),
    phone: clean(details?.phone, LIMITS.phone),
    address: clean(details?.address, LIMITS.address),
    city: clean(details?.city, LIMITS.city),
    notes: clean(details?.notes, LIMITS.notes),
  };

  if (!customer.name || !customer.phone || !customer.address || !customer.city) {
    return {
      ok: false,
      message: "Please fill in your name, phone, address and city.",
    };
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, message: "Your bag is empty." };
  }
  if (lines.length > MAX_LINES) return { ok: false, message: REBUILD };

  const payload: { fragrance_id: string; size: string; qty: number }[] = [];
  // The `Array.isArray` guard above widens `lines` to `any[]`, so the element type
  // is restated here. Nothing is taken on trust by doing so: every field is
  // re-checked on the next few lines.
  for (const line of lines as readonly OrderLineInput[]) {
    const size = SIZE_TO_DB[line?.size];
    const qty = line?.qty;
    if (
      typeof line?.variantId !== "string" ||
      !line.variantId ||
      !size ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > MAX_QTY
    ) {
      return { ok: false, message: REBUILD };
    }
    payload.push({ fragrance_id: line.variantId, size, qty });
  }

  const reference = orderReference();

  try {
    const { data, error } = await supabaseAdmin().rpc("place_order", {
      p_id: reference,
      p_name: customer.name,
      p_phone: customer.phone,
      p_address: customer.address,
      p_city: customer.city,
      p_notes: customer.notes,
      p_lines: payload,
    });
    if (error) throw new Error(error.message);

    // Stock just changed, and the root layout caches the catalogue for 300s —
    // without this, a size that just sold out would keep reading as in stock for
    // up to five minutes. Invalidating the root layout covers every page under it.
    revalidatePath("/", "layout");

    return { ok: true, reference, total: Number(data) };
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : String(cause);
    const spoken = explain(raw);
    if (!spoken) console.error(`placeOrder ${reference} failed:`, raw);
    return { ok: false, message: spoken ?? GENERIC };
  }
}
