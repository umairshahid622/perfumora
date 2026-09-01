"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * A section heading that writes itself on scroll: the text is split into words,
 * each rising and fading into place in source order, and the reveal is scrubbed
 * to scroll position so the line assembles as it is read (§1: GSAP, not CSS
 * transitions). One staggered `from` under a per-heading trigger; reduced motion
 * leaves the whole line in place. Used by every section heading except the Hero.
 *
 * Distinct from the page's `useReveal` gesture (a one-shot block fade/rise): this
 * owns the heading's motion at the word level, so a heading using it should NOT
 * also carry the `.reveal` class.
 *
 * Renders an <h2>; the caller passes the section's type/width classes through
 * `className`. `children` must be a plain string so it can be split into words.
 */
export function RevealHeading({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      // The untouched DOM is the finished line, so reduced motion is simply "do
      // nothing" — no `from` state applied, every word left visible.
      if (prefersReducedMotion()) return;

      const words = gsap.utils.toArray<HTMLElement>(".rh-word", ref.current);
      if (!words.length) return;

      // One staggered `from` under a scrubbed trigger: the stagger spreads the
      // word entrances across the scroll span, so scrolling writes them one after
      // another. `from` (set in useGSAP's layout effect) hides the words before
      // the first paint, so there is no flash of the full line first.
      gsap.from(words, {
        opacity: 0,
        yPercent: 60,
        ease: "power3.out",
        duration: 0.5,
        stagger: 0.45,
        scrollTrigger: {
          trigger: ref.current,
          start: "top 85%",
          end: "top 45%",
          scrub: 1,
        },
      });
    },
    { scope: ref },
  );

  const words = children.split(" ");

  return (
    <h2 ref={ref} className={className}>
      {words.flatMap((word, i) => [
        // A real space text-node between the inline-block words keeps the normal
        // line-break opportunity (and the space itself) that the atomic spans
        // would otherwise swallow.
        i > 0 ? " " : null,
        <span key={`${word}-${i}`} className="rh-word inline-block">
          {word}
        </span>,
      ])}
    </h2>
  );
}
