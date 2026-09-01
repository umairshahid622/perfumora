import localFont from "next/font/local";

/**
 * §3.2 — Khand (display: h1/h2 + price) and Switzer (body + micro-labels),
 * both self-hosted variable fonts loaded via next/font/local from app/fonts.
 * The declared 400–700 range covers every weight the brief calls for:
 * 400 body, 500 micro-labels, 600 display/price/buttons.
 */

export const khand = localFont({
  src: "../fonts/Khand-Variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-khand",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const switzer = localFont({
  src: "../fonts/Switzer-Variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-switzer",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
