"use client";

import { useRef, useState } from "react";
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
import {
  SPRAY_START_EVENT,
  SPRAY_COMPLETE_EVENT,
  SPRAY_RESET_EVENT,
} from "../three/useBottleUncap";

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
  const [activeStep, setActiveStep] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const triggerEl = document.getElementById(SECTION_IDS.ritual);
      if (!triggerEl) return;

      const still = prefersReducedMotion();

      // Initial subtitle state: hidden until spray reveal with the steps
      if (subtitleRef.current) {
        gsap.set(subtitleRef.current, {
          opacity: still ? 1 : 0,
          y: still ? 0 : STEP_RISE,
        });
      }

      if (mobileCardRef.current) {
        gsap.set(mobileCardRef.current, {
          opacity: still ? 1 : 0,
          y: still ? 0 : STEP_RISE,
        });
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

      if (!still) {
        if (items.length) gsap.set(items, { opacity: 0, y: STEP_RISE });
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

        const reveal = () => {
          // Steps reveal on their own timeline, independent of heading/subtitle
          const stepTl = gsap.timeline();
          if (items.length) {
            stepTl.to(items, {
              opacity: 1,
              y: 0,
              duration: STEP_DURATION,
              ease: "power3.out",
              stagger: STEP_STAGGER,
            });
          }
          if (mobileCardRef.current) {
            stepTl.to(
              mobileCardRef.current,
              {
                opacity: 1,
                y: 0,
                duration: STEP_DURATION,
                ease: "power3.out",
              },
              0,
            );
          }
          if (lines.length) {
            stepTl.to(
              lines,
              {
                opacity: 1,
                scaleX: 1,
                duration: 0.6,
                ease: "power2.out",
                stagger: STEP_STAGGER,
              },
              0.08,
            );
          }
          if (dots.length) {
            stepTl.to(
              dots,
              {
                opacity: 1,
                scale: 1,
                duration: 0.35,
                ease: "back.out(2)",
                stagger: STEP_STAGGER,
              },
              0.16,
            );
          }

          // Subtitle reveals independently, slightly after the steps begin
          if (subtitleRef.current) {
            gsap.to(subtitleRef.current, {
              opacity: 1,
              y: 0,
              duration: STEP_DURATION,
              ease: "power3.out",
              delay: 0.2,
            });
          }
        };

        const reset = () => {
          // Steps reset independently
          gsap.killTweensOf([...items, ...lines, ...dots]);
          if (items.length) gsap.set(items, { opacity: 0, y: STEP_RISE });
          if (lines.length) gsap.set(lines, { opacity: 0, scaleX: 0 });
          if (dots.length) gsap.set(dots, { opacity: 0, scale: 0 });
          if (mobileCardRef.current) {
            gsap.killTweensOf(mobileCardRef.current);
            gsap.set(mobileCardRef.current, { opacity: 0, y: STEP_RISE });
          }

          // Subtitle resets independently
          if (subtitleRef.current) {
            gsap.killTweensOf(subtitleRef.current);
            gsap.set(subtitleRef.current, { opacity: 0, y: STEP_RISE });
          }
        };

        window.addEventListener(SPRAY_START_EVENT, reveal);
        window.addEventListener(SPRAY_COMPLETE_EVENT, reveal);
        window.addEventListener(SPRAY_RESET_EVENT, reset);

        return () => {
          window.removeEventListener(SPRAY_START_EVENT, reveal);
          window.removeEventListener(SPRAY_COMPLETE_EVENT, reveal);
          window.removeEventListener(SPRAY_RESET_EVENT, reset);
        };
      }
    },
    { dependencies: [] },
  );

  return (
    <Section
      tone="light"
      overlay
      full
      className="bg-transparent pt-16 md:pt-20 pb-8 md:pb-12 md:h-full"
    >
      <Container className="relative z-20 flex flex-1 flex-col justify-between">
        <div className="flex flex-1 flex-col justify-between">
          {/* Top-left heading */}
          <div className="flex max-w-xl flex-col gap-1.5 md:gap-2 shrink-0">
            <Eyebrow>The Ritual</Eyebrow>
            <RevealHeading className="text-2xl sm:text-3xl md:text-section font-display uppercase tracking-tight text-balance">
              Three moments, one lasting impression
            </RevealHeading>
            <p
              ref={subtitleRef}
              className="text-body text-muted-on-light mt-0.5 md:mt-1 max-w-md text-xs sm:text-sm md:text-base leading-relaxed"
            >
              There are three moments, one lasting impression.
            </p>
          </div>

          {/* Desktop 3-step grid surrounding the bottle with callout pointer lines */}
          <ol
            ref={listRef}
            className={cn(
              "relative z-20 hidden md:grid md:top-0 md:mt-2",
              "md:grid-cols-[1fr_minmax(240px,340px)_1fr] md:grid-rows-2",
              "md:flex-1 md:items-center md:gap-x-4 md:gap-y-6",
            )}
          >
            {/* 01 Prime — Left side, vertically centered with bottle, line pointing right */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:items-center md:col-start-1 md:row-span-2 md:self-center md:justify-self-end">
              <div className="flex max-w-none flex-col text-left md:max-w-xs">
                <div className="flex items-baseline gap-1 md:gap-2.5">
                  <span className="font-display text-accent-on-light text-xl md:text-3xl leading-none font-medium">
                    {STEPS[0].num}
                  </span>
                  <h3 className="text-base md:text-xl font-medium tracking-tight text-ink">
                    {STEPS[0].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 leading-relaxed text-xs md:mt-2 md:text-sm">
                  {STEPS[0].body}
                </p>
              </div>

              {/* Callout line from Prime to bottle shoulder */}
              <div className="flex items-center ml-3 shrink-0 pointer-events-none">
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
              <div className="flex items-center mr-3 shrink-0 pointer-events-none pt-1">
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
                <div className="flex items-baseline gap-1 md:gap-2.5">
                  <span className="font-display text-accent-on-light text-xl md:text-3xl leading-none font-medium">
                    {STEPS[1].num}
                  </span>
                  <h3 className="text-base md:text-xl font-medium tracking-tight text-ink">
                    {STEPS[1].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 leading-relaxed text-xs md:mt-2 md:text-sm">
                  {STEPS[1].body}
                </p>
              </div>
            </li>

            {/* 03 Layer — Lower right, line pointing left to lower bottle body */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:col-start-3 md:row-start-2 md:self-center md:justify-self-start">
              {/* Callout line from bottle body to Layer */}
              <div className="flex items-center mr-3 shrink-0 pointer-events-none pt-1">
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
                <div className="flex items-baseline gap-1 md:gap-2.5">
                  <span className="font-display text-accent-on-light text-xl md:text-3xl leading-none font-medium">
                    {STEPS[2].num}
                  </span>
                  <h3 className="text-base md:text-xl font-medium tracking-tight text-ink">
                    {STEPS[2].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 leading-relaxed text-xs md:mt-2 md:text-sm">
                  {STEPS[2].body}
                </p>
              </div>
            </li>
          </ol>

          {/* Mobile Interactive Step Tabs Card (Applies ONLY to the 3 ritual steps) */}
          <div
            ref={mobileCardRef}
            className="relative z-30 flex flex-col md:hidden pointer-events-auto mt-auto"
          >
            <div className=" border-hairline-on-light bg-bg-light/92 backdrop-blur-md rounded-2xl border p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
              {/* Step tabs */}
              <div className="grid grid-cols-3 gap-1.5 border-b border-hairline-on-light pb-3">
                {STEPS.map((step, idx) => {
                  const active = idx === activeStep;
                  return (
                    <button
                      key={step.num}
                      type="button"
                      onClick={() => setActiveStep(idx)}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-xl py-2 px-1 transition-all text-xs uppercase tracking-wider",
                        active
                          ? "bg-accent-on-light text-white font-semibold shadow-xs"
                          : "bg-black/[0.03] text-muted-on-light hover:text-ink font-medium",
                      )}
                    >
                      <span
                        className={
                          active
                            ? "text-white/80 font-display"
                            : "text-accent-on-light font-display"
                        }
                      >
                        {step.num}
                      </span>
                      <span className="truncate">{step.title}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active step description */}
              <div className="pt-3 min-h-[4rem]">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-accent-on-light text-xl leading-none font-medium">
                    {STEPS[activeStep].num}
                  </span>
                  <h3 className="text-sm font-medium tracking-tight text-ink">
                    {STEPS[activeStep].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-1 text-xs leading-relaxed">
                  {STEPS[activeStep].body}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
