/**
 * Read a design token (§3.3) from the document so 3D materials stay driven by
 * the same CSS custom properties as the DOM — no duplicated hex values.
 * Returns `fallback` during SSR or if the token is unset.
 */
export function readCssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;

  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value || fallback;
}
