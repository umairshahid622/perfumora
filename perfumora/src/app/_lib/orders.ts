"use server";

import { revalidatePath } from "next/cache";
import { SIZE_TO_DB } from "./catalogue";
import { orderReference, type CustomerDetails } from "./checkout";
import { supabaseAdmin } from "./supabase-admin";
import { supabaseAuth } from "./supabase-auth";
import type { SizeMl } from "./variants";

/* ---------------------------------------------------------------------------
   Placing an order — the storefront's only write.

   A `"use server"` module, so <Checkout> can `await placeOrder(...)` straight
   from its click handler. What that means for this file: the export below is a
   public HTTP endpoint, reachable by POST from anywhere and not only through our
   own UI, and it does not require a login — guest checkout is still the common
   case. So nothing arriving here is trusted:

     - the payload names WHAT was ordered, never what it costs. `place_order`
       (perfumora-admin/supabase/schema.sql) reads every price out of
       `fragrance_sizes` itself, which is what stops a forged body buying a
       bottle for one rupee;
     - the form's `required` attributes protect the form, not this, so the fields
       are re-checked and bounded below;
     - whose order it is comes from the session cookie, never from the payload, so
       an order can only ever be attributed to whoever is signed in on the request
       that placed it;
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
 *  forged body could write a megabyte of "city" into the admin panel. The billing
 *  fields reuse `address`, `city` and `postal` — the same kind of text, so the same
 *  ceilings apply to it. */
const LIMITS = { name: 120, phone: 40, address: 400, city: 80, postal: 20, notes: 500 };
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
    postalCode: clean(details?.postalCode, LIMITS.postal),
    notes: clean(details?.notes, LIMITS.notes),
  };

  if (!customer.name || !customer.phone || !customer.address || !customer.city) {
    return {
      ok: false,
      message: "Please fill in your name, phone, address and city.",
    };
  }

  // The billing address as it will be stored. `!== false` rather than a truthiness
  // test: anything but an explicit `false` reads as "same as shipping", which is the
  // safe way round — it stores the address we already checked instead of whatever
  // three strings came with the request.
  //
  // Copied rather than left blank when the box stayed ticked, so `billing_address` is
  // always populated and neither the admin panel nor a future invoice has to know a
  // fallback rule. The order row is a snapshot, the same reason `total` is stored
  // rather than summed on read.
  const billingSame = details?.billingSame !== false;
  const billing = billingSame
    ? {
        address: customer.address,
        city: customer.city,
        postal: customer.postalCode,
      }
    : {
        address: clean(details?.billingAddress, LIMITS.address),
        city: clean(details?.billingCity, LIMITS.city),
        postal: clean(details?.billingPostalCode, LIMITS.postal),
      };

  // Required as a group, and only once the box is unticked: a billing city with no
  // street is not something an invoice can be raised from, so a half-typed billing
  // address is refused rather than stored. Nothing to check when it is ticked — those
  // three came from the shipping fields above.
  if (!billingSame && (!billing.address || !billing.city)) {
    return {
      ok: false,
      message: "Please fill in your billing address and city.",
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
    // Whose order this is. Read from the session rather than the payload for the
    // reason at the top of the file, after the validation above so an obviously
    // forged body never costs a round trip, and inside this `try` alongside
    // `supabaseAdmin()` so that an unreachable auth server cannot break this
    // function's promise never to throw.
    //
    // `getUser()` rather than `getSession()`, the same choice `currentCustomer()`
    // makes and for the same reason: it asks the auth server to validate the token
    // instead of believing what the cookie says about itself — and this stamp is
    // what decides whose order this counts as from here on.
    //
    // Null for a guest, which is still the ordinary case and stays supported end
    // to end: `orders.user_id` is nullable and `p_user_id` defaults to null.
    const supabase = await supabaseAuth();
    const { data: account } = await supabase.auth.getUser();

    const { data, error } = await supabaseAdmin().rpc("place_order", {
      p_id: reference,
      p_name: customer.name,
      p_phone: customer.phone,
      p_address: customer.address,
      p_city: customer.city,
      p_notes: customer.notes,
      p_lines: payload,
      // The deployed `place_order` takes this as its eighth argument and writes it
      // straight into `orders.user_id`; it defaults to null, which is what every
      // order before this line got. Worth remembering that PostgREST resolves an
      // RPC by the argument names in the body, so sending a key the function does
      // not declare is a 404 (PGRST202) rather than a harmless extra — this key and
      // that signature have to move together.
      p_user_id: account.user?.id ?? null,
      // Optional at checkout but never null on the way in: these columns are `not
      // null default ''`, and `p_billing_*` carries the shipping address whenever the
      // box stayed ticked. The PostgREST caveat above covers all five of them — the
      // keys here and the deployed argument list move together or not at all.
      p_postal_code: customer.postalCode,
      p_billing_same: billingSame,
      p_billing_address: billing.address,
      p_billing_city: billing.city,
      p_billing_postal_code: billing.postal,
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
