/** Shared reduced-motion check (§2.7). GSAP timelines snap to their end state
 *  instead of animating when the user asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
