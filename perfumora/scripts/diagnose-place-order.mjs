/**
 * Diagnose the "We could not place your order just now" failure.
 *
 * `orders.ts` hides the real error behind one generic sentence and logs it server
 * side, so this reproduces the same RPC call from outside and prints what it
 * actually returns.
 *
 * **Safe by construction:** `p_lines` is empty, and the very first thing
 * `place_order` does is `raise exception 'EMPTY_ORDER'` — before the orders insert,
 * before the stock loop. The transaction aborts either way, so nothing is written
 * and no stock is touched. An unknown argument (PGRST202) fails even earlier, at
 * PostgREST's function resolution, also without touching the database.
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env");
  process.exit(1);
}

console.log("project:", url.replace(/^https:\/\/([^.]+)\..*$/, "$1"));

/** The exact argument set orders.ts sends, minus p_lines' contents. */
const base = {
  p_id: "PRF-DIAGNOSTIC-0000",
  p_name: "Diagnostic",
  p_phone: "3000000000",
  p_address: "n/a",
  p_city: "n/a",
  p_notes: "",
  p_lines: [],
  p_user_id: null,
  p_postal_code: "",
  p_billing_same: true,
  p_billing_address: "",
  p_billing_city: "",
  p_billing_postal_code: "",
};

async function call(label, body) {
  const res = await fetch(`${url}/rest/v1/rpc/place_order`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  console.log(`\n--- ${label} ---`);
  console.log("HTTP", res.status, res.statusText);
  const code = parsed?.code ?? "";
  const msg = parsed?.message ?? text;
  console.log("code   :", code || "(none)");
  console.log("message:", msg);
  return { status: res.status, code, msg };
}

console.log("\n=== 1. the storefront's current call (with p_email) ===");
const withEmail = await call("with p_email", { ...base, p_email: "diagnostic@example.com" });

console.log("\n=== 2. the call before the email field existed (without p_email) ===");
const withoutEmail = await call("without p_email", base);

console.log("\n=== verdict ===");
if (withEmail.code === "PGRST202") {
  console.log(
    "p_email is NOT declared on the deployed place_order.\n" +
      "orders.ts now automatically catches this PGRST202 and falls back to the\n" +
      "13-argument call + direct customer_email update, so orders succeed regardless.\n" +
      "You can also run the migration in perfumora-admin/supabase/schema.sql in the Supabase SQL editor.",
  );
} else if (withEmail.msg?.includes("EMPTY_ORDER")) {
  console.log(
    "p_email IS accepted (the function ran and raised EMPTY_ORDER as expected).\n" +
      "So the RPC signature is fine and the failure is something else — check the\n" +
      "server log line `placeOrder <ref> failed:` for the real message.",
  );
} else {
  console.log("Unexpected result — see the raw output above.");
}
if (withoutEmail.msg?.includes("EMPTY_ORDER")) {
  console.log("\n(Control: the same call without p_email reaches the function body, so\nthe endpoint and credentials are good.)");
}
