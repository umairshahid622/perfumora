/**
 * Everything the storefront knows about a fragrance *besides* which ones exist.
 *
 * The catalogue itself now comes from Supabase — see `catalogue.ts`, which is the
 * only place that talks to the database. What lives here is the maths that turns
 * one `fragrances.color` hex into every colour the page needs (`readableAccent`,
 * `readableAccentOnDark`, `juiceColor`, `accentGlow`, `contrastToken`), plus the
 * small helpers for reading a variant's per-size prices and stock.
 *
 * Per §0 the *only* thing that changes across products is the liquid colour —
 * bottle, cap and jar geometry never change — so a variant is essentially a name +
 * a colour + what sizes it sells. That colour drives both the live `--accent`
 * token and the 3D fragrance: one shared liquid mesh whose material is tinted per
 * variant (never re-meshed).
 */

/**
 * A `fragrances.id` — free text in the database, set by whoever created the row in
 * the admin panel. Kept as a named alias rather than bare `string` because it is
 * the key the cart and the order payload join on.
 */
export type VariantId = string;

export type SizeMl = 30 | 50;

/**
 * What one size of one fragrance costs and how many are left.
 *
 * Sparse on purpose, mirroring `fragrance_sizes` and the admin's own `SizeMap`: a
 * size with no entry is a size we don't sell, so it stays absent rather than
 * becoming `{ price: 0, stock: 0 }`. Filling it in would make a 30ml-only
 * fragrance look like it also sells a free, sold-out 50ml. "Sold but out of stock"
 * is a present entry with `stock: 0` — a different state, and the UI shows it.
 */
export type SizeMap = Partial<Record<SizeMl, { price: number; stock: number }>>;

export interface Variant {
  id: VariantId;
  /** Display name — the Hero background type and cart line label. */
  name: string;
  /** The saturated variant colour (§3.3) — the only saturated colour on the page. */
  hex: string;
  /** Which text token stays legible on a button filled with `hex` (§3.3). */
  contrast: "ink" | "paper";
  /** Price + stock per size sold. Never empty: `getCatalogue` drops fragrances
   *  with no size rows, since they have no price and cannot be bought. */
  sizes: SizeMap;
}

/** The sizes this fragrance actually sells, ascending. */
export function offeredSizes(sizes: SizeMap): SizeMl[] {
  return ([30, 50] as const).filter((size) => sizes[size] !== undefined);
}

/**
 * The size a fresh selector opens on: 50ml where it is sold, otherwise the only
 * other option. Non-optional because every variant that reaches the UI sells at
 * least one size (see `Variant.sizes`).
 */
export function defaultSize(sizes: SizeMap): SizeMl {
  return sizes[50] ? 50 : 30;
}

/** WCAG relative luminance of an sRGB hex, 0 (black) … 1 (white). */
function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const channels = [0, 1, 2].map((i) => {
    const c = parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Button label token: light `--paper` on dark accents, dark `--ink` on light. */
export function contrastToken(hex: string): "ink" | "paper" {
  return relativeLuminance(hex) > 0.45 ? "ink" : "paper";
}

/**
 * The accent floored for use as a *foreground* (text / border / small fill) on
 * the light parchment (`--bg-light`). The same `hex` doubles as the 3D liquid
 * colour and the UI accent, so the pale SKUs — near-clear Tahnoun, straw Shay
 * Oud — all but disappear as text on the parchment. This darkens the colour
 * toward black *along its own hue* until it clears a legible contrast, so the
 * fills, glow and liquid keep the true `hex` while the foreground stays
 * readable. Colours already dark enough pass through unchanged.
 *
 * It stays legible over the dark sections as well — better, in fact (≈4.7:1
 * there against ≈3.5:1 here) — which is why the footer's hovers use it on both
 * tones. What it cannot do there is read as *emphasis*: beside paper-white text
 * a mid-tone is the dimmest thing in the row, so a link that is current looks
 * switched off. The header switches to `readableAccentOnDark` for that.
 */
const ACCENT_ON_LIGHT_MAX_LUM = 0.2; // ≈ 3.5:1 on the #f3ece0 parchment

/**
 * The same idea over the near-black (`--bg-dark`), with the ceiling raised: high
 * enough that the saturated SKUs pass through at their true hex and sit brighter
 * than a mid-tone, low enough that the near-clear ones keep a visible tint
 * instead of arriving as a second shade of white next to `--paper`.
 */
const ACCENT_ON_DARK_MAX_LUM = 0.45; // ≈ 9:1 on the #0b0b0c near-black

/**
 * A hex dimmed along its own hue until its luminance is at most `maxLum`;
 * returned untouched if it is already there.
 *
 * Luminance is a linear combination of the linear-light channels, so scaling all
 * three by the same k scales luminance by k while leaving the chromaticity (hue +
 * saturation) alone — "the same colour, dimmer".
 */
function capLuminance(hex: string, maxLum: number): string {
  const lum = relativeLuminance(hex);
  if (lum <= maxLum) return hex;

  const k = maxLum / lum;
  const n = hex.replace("#", "");
  const clamp = (c: number) => Math.min(1, Math.max(0, c));
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const toSrgb = (c: number) =>
    c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  const channel = (i: number) => {
    const srgb = parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255;
    return Math.round(toSrgb(clamp(toLinear(srgb) * k)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Foreground accent on the parchment — `--accent-on-light`. */
export function readableAccent(hex: string): string {
  return capLuminance(hex, ACCENT_ON_LIGHT_MAX_LUM);
}

/** Foreground accent over a dark section — `--accent-on-dark`. */
export function readableAccentOnDark(hex: string): string {
  return capLuminance(hex, ACCENT_ON_DARK_MAX_LUM);
}

/**
 * The 3D fragrance renders the true `hex` (the UI accent is the one `readableAccent`
 * darkens). But the palette's near-clear SKUs — Tahnoun, Walaya, the "crystal
 * clear" Marlys — sit so close to white that they read as dead white rather than
 * clear liquid. `juiceColor` treats the liquid *only*, keyed on how pale the juice
 * is: it amplifies a pale juice's own faint hue (its cool / rose / warm cast) around
 * its grey level so it reads as a *tinted* clear liquid, and leaves the saturated
 * golds / pinks / turquoises exactly as authored. Opacity is uniform across every
 * juice (`LIQUID_OPACITY` in BottleGltf) — hue is all that changes between them.
 */
const LIQUID_LUM_DENSE = 0.6; // at/below: no tint boost — the saturated SKUs pass through
const LIQUID_LUM_CLEAR = 0.9; // at/above: full tint boost — the near-clear SKUs
const LIQUID_TINT_BOOST = 3; // saturation multiplier at the pale end

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0 at the dense end of the band, 1 at the clear end — how "pale" a juice reads. */
function paleFactor(hex: string): number {
  const lum = relativeLuminance(hex);
  return clamp01((lum - LIQUID_LUM_DENSE) / (LIQUID_LUM_CLEAR - LIQUID_LUM_DENSE));
}

/** Colour for the 3D liquid: a pale juice's own hue amplified into a perceptible
 *  tint; saturated juices returned unchanged. */
export function juiceColor(hex: string): string {
  const s = 1 + paleFactor(hex) * (LIQUID_TINT_BOOST - 1);
  if (s === 1) return hex;
  const n = hex.replace("#", "");
  const ch = [0, 1, 2].map((i) => parseInt(n.slice(i * 2, i * 2 + 2), 16));
  const mean = (ch[0] + ch[1] + ch[2]) / 3;
  const push = (c: number) =>
    Math.round(clamp01((mean + (c - mean) * s) / 255) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${push(ch[0])}${push(ch[1])}${push(ch[2])}`;
}

export function formatPrice(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";

  return `Rs. ${Number(amount).toLocaleString("en-PK", {
    maximumFractionDigits: 0,
  })}`;
}

/** `--accent-glow`: the accent at low opacity for the Hero glow only (§3.3). */
export function accentGlow(hex: string, alpha = 0.3): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
