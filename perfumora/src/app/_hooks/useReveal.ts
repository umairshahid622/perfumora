"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * The page's one repeated entrance gesture (§4 / §6.3 #12). Returns a scope ref
 * to put on a section's content wrapper; every descendant tagged
 * `className="reveal"` rises and fades into place as that section scrolls into
 * view, staggered in source order — the same `power3.out` language the Hero's
 * name transition already speaks, so the whole page feels authored by one hand.
 *
 * Targets are marked by class rather than a `data-` attribute so the reveal can
 * tag component leaves (`<Eyebrow>`, `<ImagePlaceholder>`) that forward
 * `className` but not arbitrary props — consistent with the `.letter` /
 * `.wave-bar` GSAP hooks used elsewhere. The class carries no styles of its own.
 *
 * Fires once: a beat that re-hides itself every time it leaves the viewport reads
 * as a glitch, not a flourish. Reduced motion leaves the elements in their
 * natural, fully-visible state — no travel, no fade, nothing to opt out of.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const scope = useRef<T>(null);

  useGSAP(
    () => {
      // The untouched DOM is already the finished state, so reduced motion is
      // simply "do nothing" — never a zero-duration tween that could leave a
      // half-applied `from` value behind.
      if (prefersReducedMotion()) return;

      const targets = gsap.utils.toArray<HTMLElement>(".reveal", scope.current);
      if (!targets.length) return;

      // `from` (not `fromTo`) so the resting state is whatever the layout already
      // is — the tween only owns the entrance. useGSAP runs in a layout effect,
      // so the hidden start state is set before the browser paints: no flash of
      // the content in place and then yanked away.
      gsap.from(targets, {
        opacity: 0,
        y: 32,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: scope.current,
          // The beat is vertically centred in a full-height section, so its top
          // edge enters well before the content is read — hold the reveal until
          // it is a little way up the screen.
          start: "top 78%",
          once: true,
        },
      });
    },
    { scope },
  );

  return scope;
}
