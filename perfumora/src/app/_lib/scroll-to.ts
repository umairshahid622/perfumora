"use client";

import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

// §4.0: nav links smooth-scroll via GSAP's ScrollToPlugin, not the browser's
// native `scroll-behavior`, so easing/duration match the rest of the motion.
gsap.registerPlugin(ScrollToPlugin);

/**
 * Smooth-scroll to a section `id` on the same page (never a route change).
 *
 * `instant` drops the ease and jumps. It's for the one case where the scroll must
 * not be seen: arriving on a route while the transition curtain still covers the
 * screen (see <RouteTransitionProvider>), where a one-second glide would still be
 * running as the panel lifts.
 */
export function scrollToSection(
  id: string,
  { instant = false }: { instant?: boolean } = {},
): void {
  if (typeof document === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  gsap.to(window, {
    duration: reduced || instant ? 0 : 1,
    ease: "power3.inOut",
    scrollTo: { y: target, offsetY: 0, autoKill: true },
    overwrite: true,
  });
}
