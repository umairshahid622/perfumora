"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";
import { RITUAL_STEPS_DELAY } from "../three/useBottleUncap";

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    num: "01",
    title: "Prime",
    body: "A single press to warm pulse points — wrist, throat, the nape of the neck.",
  },
  {
    num: "02",
    title: "Apply",
    body: "Hold the vessel a hand's width away and let the mist settle, never rub.",
  },
  {
    num: "03",
    title: "Layer",
    body: "Return through the day as the scent softens; the refill is always close.",
  },
] as const;

const STEP_RISE = 20;
const STEP_DURATION = 0.8;
const STEP_STAGGER = 0.14;

export function Ritual() {
  const listRef = useRef<HTMLOListElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const triggerEl = document.getElementById(SECTION_IDS.ritual);
      if (!triggerEl) return;

      const still = prefersReducedMotion();

      // Initial subtitle state: hidden until spray reveal with the steps
      if (subtitleRef.current) {
        gsap.set(subtitleRef.current, { opacity: still ? 1 : 0, y: still ? 0 : STEP_RISE });
      }

      const items = gsap.utils.toArray<HTMLElement>("li", listRef.current);
      const lines = gsap.utils.toArray<SVGPathElement>(
        ".ritual-line",
        listRef.current,
      );
      const dots = gsap.utils.toArray<SVGCircleElement>(
        ".ritual-dot",
        listRef.current,
      );

      if (!items.length) return;

      if (!still) {
        // Force initial hidden state so steps never show before the spray
        gsap.set(items, { opacity: 0, y: STEP_RISE });
        if (lines.length)
          gsap.set(lines, {
            opacity: 0,
            scaleX: 0,
            transformOrigin: "left center",
          });
        if (dots.length)
          gsap.set(dots, {
            opacity: 0,
            scale: 0,
            transformOrigin: "center center",
          });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: triggerEl,
            start: "top top",
            end: "bottom top",
            scrub: 1,
          },
        });

        tl.to(
          items,
          {
            opacity: 1,
            y: 0,
            duration: STEP_DURATION,
            ease: "power3.out",
            stagger: STEP_STAGGER,
          },
          RITUAL_STEPS_DELAY,
        );

        // Subtitle reveals with the steps, after the last step lands
        if (subtitleRef.current) {
          tl.to(
            subtitleRef.current,
            {
              opacity: 1,
              y: 0,
              duration: STEP_DURATION,
              ease: "power3.out",
            },
            RITUAL_STEPS_DELAY + STEP_STAGGER * (items.length - 1) + 0.1,
          );
        }

        if (lines.length) {
          tl.to(
            lines,
            {
              opacity: 1,
              scaleX: 1,
              duration: 0.6,
              ease: "power2.out",
              stagger: STEP_STAGGER,
            },
            RITUAL_STEPS_DELAY + 0.08,
          );
        }

        if (dots.length) {
          tl.to(
            dots,
            {
              opacity: 1,
              scale: 1,
              duration: 0.35,
              ease: "back.out(2)",
              stagger: STEP_STAGGER,
            },
            RITUAL_STEPS_DELAY + 0.16,
          );
        }

        // Showcase scrubbed transition: as user scrolls from the steps into the showcase scene,
        // fade out the step cards, keeping the subtitle on screen.
        if (listRef.current) {
          ScrollTrigger.create({
            trigger: triggerEl,
            start: () => "top+=" + Math.round(window.innerHeight * 1) + " top",
            end: () => "top+=" + Math.round(window.innerHeight * 1.9) + " top",
            scrub: 1,
            animation: gsap.timeline().to(listRef.current, {
              opacity: 0,
              y: -24,
              ease: "power2.inOut",
            }),
          });
        }
      }
    },
    { scope: listRef },
  );

  return (
    <Section
      tone="light"
      overlay
      full
      className="bg-transparent pt-16 md:pt-20 pb-8 md:pb-12"
    >
      <Container className="flex flex-1 flex-col h-full justify-between">
        <div className="flex flex-1 flex-col h-full justify-between">
          {/* Top-left heading */}
          <div className="flex max-w-xl flex-col gap-2 shrink-0">
            <Eyebrow>The Ritual</Eyebrow>
            <RevealHeading className="text-section text-balance">
              Three moments, one lasting impression
            </RevealHeading>
            <p
              ref={subtitleRef}
              className="text-body text-muted-on-light mt-1 max-w-md text-sm md:text-base leading-relaxed"
            >
              There are three moments, one lasting impression.
            </p>
          </div>

          {/* Phone-only: the band the bottle occupies above the stacked steps */}
          <div aria-hidden="true" className="h-[14vh] shrink-0 md:hidden" />

          {/* 3-step grid surrounding the bottle with callout pointer lines */}
          <ol
            ref={listRef}
            className={cn(
              "relative -top-28 mt-4 grid grid-cols-3 gap-2 md:top-0 md:mt-2",
              "md:grid-cols-[1fr_minmax(240px,340px)_1fr] md:grid-rows-2",
              "md:flex-1 md:items-center md:gap-x-4 md:gap-y-6",
            )}
          >
            {/* 01 Prime — Left side, vertically centered with bottle, line pointing right */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:items-center md:col-start-1 md:row-span-2 md:self-center md:justify-self-end">
              <div className="flex max-w-none flex-col text-left md:max-w-xs">
                <span className="border-hairline-on-light w-full border-t mb-2 md:mb-3 md:hidden" />
                <div className="flex items-baseline gap-1 md:gap-2.5">
                  <span className="font-display text-accent-on-light text-xl md:text-3xl leading-none font-medium">
                    {STEPS[0].num}
                  </span>
                  <h3 className="text-base md:text-xl font-medium tracking-tight text-ink">
                    {STEPS[0].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-1 leading-relaxed text-xs md:mt-2 md:text-sm">
                  {STEPS[0].body}
                </p>
              </div>

              {/* Callout line from Prime to bottle shoulder */}
              <div className="hidden md:flex items-center ml-3 shrink-0 pointer-events-none">
                <svg
                  width="110"
                  height="36"
                  viewBox="0 0 110 36"
                  fill="none"
                  className="overflow-visible stroke-accent-on-light/75 text-accent-on-light"
                >
                  <path
                    d="M 0 10 L 45 10 L 78 26 L 105 26"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ritual-line"
                  />
                  <circle
                    cx="105"
                    cy="26"
                    r="3"
                    fill="currentColor"
                    className="ritual-dot"
                  />
                </svg>
              </div>
            </li>

            {/* 02 Apply — Upper right, line pointing down-left to bottle collar */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:col-start-3 md:row-start-1 md:self-center md:justify-self-start">
              {/* Callout line from bottle collar to Apply */}
              <div className="hidden md:flex items-center mr-3 shrink-0 pointer-events-none pt-1">
                <svg
                  width="110"
                  height="44"
                  viewBox="0 0 110 44"
                  fill="none"
                  className="overflow-visible stroke-accent-on-light/75 text-accent-on-light"
                >
                  <circle
                    cx="4"
                    cy="36"
                    r="3"
                    fill="currentColor"
                    className="ritual-dot"
                  />
                  <path
                    d="M 4 36 L 40 36 L 72 10 L 110 10"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ritual-line"
                  />
                </svg>
              </div>

              <div className="flex max-w-none flex-col text-left md:max-w-xs">
                <span className="border-hairline-on-light w-full border-t mb-2 md:mb-3 md:hidden" />
                <div className="flex items-baseline gap-1 md:gap-2.5">
                  <span className="font-display text-accent-on-light text-xl md:text-3xl leading-none font-medium">
                    {STEPS[1].num}
                  </span>
                  <h3 className="text-base md:text-xl font-medium tracking-tight text-ink">
                    {STEPS[1].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-1 leading-relaxed text-xs md:mt-2 md:text-sm">
                  {STEPS[1].body}
                </p>
              </div>
            </li>

            {/* 03 Layer — Lower right, line pointing left to lower bottle body */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:col-start-3 md:row-start-2 md:self-center md:justify-self-start">
              {/* Callout line from bottle body to Layer */}
              <div className="hidden md:flex items-center mr-3 shrink-0 pointer-events-none pt-1">
                <svg
                  width="110"
                  height="28"
                  viewBox="0 0 110 28"
                  fill="none"
                  className="overflow-visible stroke-accent-on-light/75 text-accent-on-light"
                >
                  <circle
                    cx="4"
                    cy="14"
                    r="3"
                    fill="currentColor"
                    className="ritual-dot"
                  />
                  <path
                    d="M 4 14 L 45 14 L 70 14 L 110 14"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ritual-line"
                  />
                </svg>
              </div>

              <div className="flex max-w-none flex-col text-left md:max-w-xs">
                <span className="border-hairline-on-light w-full border-t mb-2 md:mb-3 md:hidden" />
                <div className="flex items-baseline gap-1 md:gap-2.5">
                  <span className="font-display text-accent-on-light text-xl md:text-3xl leading-none font-medium">
                    {STEPS[2].num}
                  </span>
                  <h3 className="text-base md:text-xl font-medium tracking-tight text-ink">
                    {STEPS[2].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-1 leading-relaxed text-xs md:mt-2 md:text-sm">
                  {STEPS[2].body}
                </p>
              </div>
            </li>
          </ol>
        </div>
      </Container>
    </Section>
  );
}
