/**
 * The twenty-four SKUs. Per §0 the *only* thing that changes across products is the
 * liquid colour — bottle, cap and jar geometry never change — so a variant is
 * essentially a name + a colour. That colour drives both the live `--accent`
 * token and the 3D fragrance: one shared liquid mesh whose material is tinted
 * per variant (never re-meshed).
 *
 * Each `hex` is matched to that product's real juice, read from the reference
 * bottle photos (and cross-checked against the known inspirations — Bombshell's
 * pink, LV Imagination's turquoise, Arabian Oud Madawi's gold). Prices are
 * placeholder (see SIZE_PRICES) — no real catalogue exists yet.
 */

export type VariantId =
  | "madawi"
  | "shay_oud"
  | "boom_shell"
  | "ahojas_oud"
  | "imperial_vally"
  | "rose_vanilla"
  | "tahnoun_oud"
  | "abdul_majeed"
  | "walaya_d_marly"
  | "tyger"
  | "parada"
  | "strong_with_you"
  | "marj"
  | "creed_aventus"
  | "gucci_flora"
  | "hacivat_nishane"
  | "shay_shay"
  | "tuxedo"
  | "miss_dior"
  | "dubai_maydan"
  | "delna_de_marly"
  | "angels_share"
  | "sauwage_dior"
  | "vanila_28_kayal";
// madavi: unisex
// shay_oud: men
// boom_shell: female
// ahojas_oud: male
export type SizeMl = 30 | 50;

export interface Variant {
  id: VariantId;
  /** Display name — the Hero background type and cart line label. Placeholder. */
  name: string;
  /** The saturated variant colour (§3.3) — the only saturated colour on the page. */
  hex: string;
  /** Which text token stays legible on a button filled with `hex` (§3.3). */
  contrast: "ink" | "paper";
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
function contrastToken(hex: string): "ink" | "paper" {
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

const PALETTE: ReadonlyArray<Pick<Variant, "id" | "name" | "hex">> = [
  { id: "madawi", name: "Madawi", hex: "#CBA23C" }, // golden amber (unisex)
  { id: "shay_oud", name: "Shay Oud", hex: "#D7CD80" }, // pale tea-straw
  { id: "boom_shell", name: "Boom Shell", hex: "#E492A6" }, // candy rose pink
  { id: "ahojas_oud", name: "Ahojas Oud", hex: "#CF9138" }, // warm amber
  { id: "imperial_vally", name: "Imperial Vally", hex: "#2EA39A" }, // turquoise
  { id: "rose_vanilla", name: "Rose Vanilla", hex: "#D2837A" }, // warm coral rose
  { id: "tahnoun_oud", name: "Tahnoun Oud", hex: "#F4F5F6" }, // near-clear
  { id: "abdul_majeed", name: "Abdul Majeed", hex: "#C9A94A" }, // golden honey
  { id: "walaya_d_marly", name: "Walaya de Marly", hex: "#EAEDE9" }, // near-clear, faint cool
  { id: "tyger", name: "Tyger", hex: "#C6C574" }, // pale yellow-green
  { id: "parada", name: "Parada", hex: "#BFA23A" }, // deep golden
  { id: "strong_with_you", name: "Strong With You", hex: "#EDE3E2" }, // near-clear, faint rose
  { id: "marj", name: "Marj", hex: "#D6A78D" }, // warm peach-rose
  { id: "creed_aventus", name: "Creed Aventus", hex: "#E8EBE6" }, // near-clear, faint green-grey
  { id: "gucci_flora", name: "Gucci Flora", hex: "#EFF1F0" }, // crystal clear
  { id: "hacivat_nishane", name: "Hacivat Nishane", hex: "#C2C168" }, // chartreuse green-yellow
  { id: "shay_shay", name: "Shay Shay", hex: "#D5CC74" }, // pale straw yellow
  { id: "tuxedo", name: "Tuxedo", hex: "#B9AF4E" }, // olive-chartreuse
  { id: "miss_dior", name: "Miss Dior", hex: "#EAE7E4" }, // near-clear, faint warm
  { id: "dubai_maydan", name: "Dubai Maydan", hex: "#C9C578" }, // pale yellow-green
  { id: "delna_de_marly", name: "Delna de Marly", hex: "#EEF0EE" }, // crystal clear
  { id: "angels_share", name: "Angel's Share", hex: "#C2A542" }, // golden olive
  { id: "sauwage_dior", name: "Sauvage Dior", hex: "#EDF0F0" }, // crystal clear, faint cool
  { id: "vanila_28_kayal", name: "Vanilla 28 Kayali", hex: "#C59733" }, // deep golden amber
];

export const VARIANTS: readonly Variant[] = PALETTE.map((v) => ({
  ...v,
  contrast: contrastToken(v.hex),
}));

export const SIZES: readonly SizeMl[] = [30, 50];

/**
 * Placeholder pricing — a function of size only, identical across variants
 * (nothing in the brief prices SKUs differently). NOT final catalogue pricing.
 */
export const SIZE_PRICES: Record<SizeMl, number> = {
  30: 2000,
  50: 3000,
};

export function priceFor(size: SizeMl): number {
  return SIZE_PRICES[size];
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
