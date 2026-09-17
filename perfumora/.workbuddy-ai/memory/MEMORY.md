# Perfumora — project notes

## Architecture

Next.js 16 (Turbopack) storefront. `pnpm` is the package manager but is **not on the sandbox
PATH** — use `/opt/homebrew/bin/pnpm`.

- `OpeningStage` (`src/app/_components/sections/`) is a 500vh stage holding the Hero, Manifesto
  and Ritual as `sticky` panels dissolved between (cross-fade + 80px slide). It also hijacks the
  wheel with an eased `scrollTo` for the stage's duration.
- `PersistentBottle` is one R3F `<Canvas>` for the whole route, riding inside the Ritual's
  lifted wrapper so the vessel travels with the stage. Because of it, **the app needs WebGL** —
  headless Chromium in this sandbox cannot hydrate the page at all.
- `useBottleUncap` is the Ritual's theatre (cap lift → pump press → mist → `SPRAY_COMPLETE_EVENT`
  → steps reveal), now a single "master directional controller" keyed on stage progress.
  **Its zones must gate on `capLifted`, not `hasUncapped`.** `hasUncapped` only clears below
  2.5 screens, so it stays true while the customer is anywhere past the Ritual — and
  `applyClose` places the cap on an *absolute* curve (`1 - closeProgress`, fully open at
  `CLOSE_FROM`). Gating the close on `hasUncapped` therefore snapped a seated cap open on
  any re-entry from below/above (Gallery → Ritual → Gallery). Any state that commands an
  absolute transform must be gated on the object actually being in that state.
- Orders go through the `placeOrder` Server Action (`_lib/orders.ts`) → one `place_order` RPC.
  **Guest checkout is supported end to end** (`orders.user_id` is nullable, `p_user_id` defaults
  to null); the database prices every order itself, never the client.
- **The storefront and the DB schema live in different repos** (`perfumora` and
  `perfumora-admin/supabase/schema.sql`) and must deploy in step. PostgREST resolves an RPC by
  argument *name*, and a key the function does not declare is a 404 (`PGRST202`) rather than a
  harmless extra — so a new `p_*` key in `orders.ts` fails **every** order until the schema is
  applied. Always add the parameter `default`-ed so the schema can go first. Adding a parameter
  also means: drop the old arity explicitly (`create or replace` cannot change an argument
  list), and extend the `revoke`/`grant` type lists. Postgres also requires every parameter
  after the first defaulted one to carry a default.

## Conventions worth keeping

- **Cross-island communication uses `window` CustomEvents**, not context providers, when the two
  ends live in different trees. Precedents: `SPRAY_COMPLETE_EVENT` / `SPRAY_RESET_EVENT` /
  `SPRAY_START_EVENT` (`useBottleUncap` → `Ritual`) and `AUTH_REQUEST_EVENT` (`_lib/auth-gate.ts`,
  `Checkout` → `Navigation`). An event may carry a `resolve` callback so the sender can await an
  answer; set a `handled` flag synchronously so a request with no listener fails fast rather than
  hanging.
- **Never route type-scale tokens through `cn()`.** tailwind-merge files `text-micro` / `text-body`
  / `text-price` in the same group as `text-<colour>`, so a `cn()` holding both silently drops one.
  Concatenate plain strings instead.
- The header (`Navigation`) owns `panel` state for every overlay: `menu`, `cart`, `auth`,
  `account`, `logout`, `mobileMenu`. **All dismissals must go through `close()`**, never a bare
  `setPanel(null)` — other logic hangs off it.
- Motion is authored in GSAP, not CSS. 3D components expose refs and own no animation.
- **A `ShaderMaterial`'s `uniforms` must be created once and never rebuilt.** R3F v9 does
  not hand the material the object a `uniforms` prop carries — `applyProps` *merges* it
  into a stable target and only the `onUpdate` shunt re-points the material afterwards,
  which `invalidateInstance` can skip (early-returns while the instance has no parent).
  A `useMemo(..., [color])` that rebuilds it per variant leaves the per-frame writer and
  the renderer holding different objects; `uGlobalOpacity` sticks at 0 and the object goes
  invisible with no error. Apply changing values through an effect instead
  (`uniforms.uColor.value.set(color)`).
- Tune a particle cloud by **percentiles across the whole cloud**, never the nominal
  particle — a cone's upper edge launches at `elevation + coneAngle`, so the on-axis
  number can look flat while the cloud climbs.
- Tune the mist **in screen space, through `RITUAL_YAW`**, for both length and angle.
  The yaw foreshortens the plume's forward travel to `sin(0.55) ≈ 0.52`, so a screen
  length of 0.86 bottle needs roughly double that in local space, and the launch angle
  the eye reads is `atan(tan(elevation) / sin(RITUAL_YAW))` — **very nearly double** the
  local elevation. `elevationAngle: 0.34` read as 34° on screen, not 19.5°, which is why
  "too much upwards" came back twice. **The user settled on `elevationAngle: 0.0`** — a
  level launch — so anything above ~0.10 local is now a regression. Simulation scripts
  live in `scripts/` (`mist-profile-sim.mjs`, `mist-uniforms-test.mjs`).
- The mist is a **mid warm grey haze** (`mix(vec3(0.66,0.64,0.61), uColor, 0.26)`), not a
  white one. The parchment is `--paper: #f3ece0`, already 0.95 in red, so a pale cloud has
  nowhere to go — at 0.87 it sat ~8% below the page and was invisible ("barely visible").
  Contrast has to win over hue fidelity here. Visibility levers, in order of softness:
  `peakOpacity` (0.58), then the colour base, then `dotSize` (0.045).
- Comments in this codebase are long-form and explain *why*. Match that when editing.
