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
  /** Optional public URL to transparent bottle shot (stored in Supabase Storage). */
  imageUrl?: string | null;
  /** Concentration tier (e.g. Eau de Cologne, Eau de Toilette, Eau de Parfum, Extrait de Parfum). */
  concentration?: string;
  /** Price + stock per size sold. Never empty: `getCatalogue` drops fragrances
   *  with no size rows, since they have no price and cannot be bought. */
  sizes: SizeMap;
}

/** The sizes this fragrance actually sells, ascending. */
export function offeredSizes(sizes: SizeMap): SizeMl[] {
  return ([30, 50] as const).filter((size) => sizes[size] !== undefined);
}

/**
 * The size a fresh selector opens on, or `null` when nothing is buyable.
 *
 * Preference is 50ml over 30ml, but only among the sizes actually *in stock*.
 * "Which sizes does this fragrance sell" and "which can be bought right now" are
 * different questions — a size keeps its row when it sells out, so it stays on
 * screen struck through — and this answers the second.
 *
 * The old version asked the first (`sizes[50] ? 50 : 30`), which on a fragrance
 * whose 50ml had sold out opened the selector on the unavailable pill and quoted
 * its price: Boom Shell showed Rs. 4,100 for a 50ml nobody could buy while the
 * 30ml sat in stock at Rs. 2,900.
 *
 * `null` is a real answer. A fragrance with every size out of stock opens with
 * nothing selected, and the product bar shows its Sold Out state rather than
 * pre-selecting a size that cannot be added.
 */
export function defaultSize(sizes: SizeMap): SizeMl | null {
  const buyable = (size: SizeMl) => (sizes[size]?.stock ?? 0) > 0;
  if (buyable(50)) return 50;
  if (buyable(30)) return 30;
  return null;
}

/**
 * The size entry a product surface should quote, given whatever is selected.
 *
 * `selected` is `null` when the fragrance is entirely out of stock, and then
 * there is no selection to price — so this answers with the entry size (the
 * smallest the fragrance sells) to keep a price on screen. The caller reads
 * `stock === 0` to know the thing cannot be bought.
 *
 * Shared rather than written out in both places because <ProductBar> and
 * <GalleryCard> have to agree: the same fragrance must quote the same price in
 * both, and a rule stated twice is a rule that drifts.
 */
export function quotedSize(
  sizes: SizeMap,
  selected: SizeMl | null,
): { size: SizeMl; price: number; stock: number } {
  // Present by construction: `offeredSizes` only names sizes this fragrance has
  // a row for, and a fragrance with no rows never reaches the UI (see
  // `Variant.sizes`).
  const chosen = selected ?? offeredSizes(sizes)[0]!;
  return { size: chosen, ...sizes[chosen]! };
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
 * Where a juice stops being darkened for the studio and starts being kept pale,
 * and how much its own faint cast is amplified once it is.
 *
 * `LIQUID_LUM_DENSE` is the switch: at or above it the fragrance is a near-clear
 * one and takes the `paleJuice` route below. `LIQUID_LUM_CLEAR` and
 * `LIQUID_TINT_BOOST` shape that route — the boost ramps in across the band
 * between them, reaching `LIQUID_TINT_BOOST`× at the clear end, so a juice with a
 * whisper of rose or blue in it gains a visible cast while a neutral one is left
 * exactly as authored.
 *
 * These three were left behind by an earlier rewrite: documented, still exported
 * to nothing, and referenced only by a `paleFactor` no one called. The consequence
 * was that the near-clear case had no handling at all — see `paleJuice`.
 */
const LIQUID_LUM_DENSE = 0.6;
const LIQUID_LUM_CLEAR = 0.9;
const LIQUID_TINT_BOOST = 3;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0 at the dense end of the band, 1 at the clear end — how "pale" a juice reads. */
function paleFactor(hex: string): number {
  const lum = relativeLuminance(hex);
  return clamp01((lum - LIQUID_LUM_DENSE) / (LIQUID_LUM_CLEAR - LIQUID_LUM_DENSE));
}

/** Clamp a channel value to a byte. */
const clampChannel = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * A pale juice, kept pale.
 *
 * `readableAccent` floors every colour to luminance 0.2 so it stays legible as
 * text on the parchment, and the calibration below darkens it further. Both are
 * right for a *button* and wrong for a *liquid*. Cobalt Elixir is `#e5e5e5` — a
 * neutral near-white — and through those it came out `#5a4345`: dark, and warm, a
 * cast its own hex does not contain, because the calibration scales each channel
 * by a different factor. Over the parchment that rendered as grey, which is what
 * the bottle was reported as showing for a colour that is almost white.
 *
 * A clear fragrance has to read as clear liquid, so a pale juice keeps its own
 * luminance and has only its own faint cast amplified — its deviation from its own
 * grey level, scaled up. A neutral near-white therefore stays exactly itself, and
 * a juice with a whisper of rose or blue gains just enough to read as *tinted*
 * rather than as water.
 */
function paleJuice(hex: string): string {
  const n = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  const grey = (channels[0] + channels[1] + channels[2]) / 3;
  const boost = 1 + (LIQUID_TINT_BOOST - 1) * paleFactor(hex);
  return `#${channels
    .map((c) =>
      clampChannel(grey + (c - grey) * boost)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Calibrates a fragrance color for the Three.js studio environment so the rendered
 * 3D liquid pixel (through studio lighting, tone mapping and outer bottle glass)
 * matches the 2D CSS button/accent color with perceptual precision.
 */
export function juiceColor(hex: string): string {
  const accent = readableAccent(hex);

  // Exact studio-calibrated values for catalogue fragrances
  if (accent === "#9a7177") {
    // Boom Shell (dusty mauve / rosewood)
    return "#7c2e3c";
  }
  if (accent === "#7c7f56") {
    // Parada (olive green)
    return "#465000";
  }

  // A pale juice is not darkened at all — see `paleJuice`. Checked before the
  // calibration below, because that calibration is the thing that turns a
  // near-white into grey. The comparison is on the fragrance's own `hex`, not on
  // the darkened accent: it is the juice that is pale, not the button.
  if (relativeLuminance(hex) >= LIQUID_LUM_DENSE) return paleJuice(hex);

  // General studio calibration for any variant
  const n = accent.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);

  const cr = clampChannel((r - 30) * 0.96);
  const cg = clampChannel((g - 36) * 0.76);
  const cb = clampChannel((b - 36) * 0.78);

  return `#${cr.toString(16).padStart(2, "0")}${cg.toString(16).padStart(2, "0")}${cb.toString(16).padStart(2, "0")}`;
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
