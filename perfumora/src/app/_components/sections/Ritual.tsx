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

        const allStepElements = () => [
          ...items,
          ...lines,
          ...dots,
          mobileCardRef.current,
          subtitleRef.current,
        ].filter(Boolean);

        const reveal = () => {
          gsap.killTweensOf(allStepElements());

          // Steps reveal cleanly on their own timeline
          const stepTl = gsap.timeline();
          if (items.length) {
            stepTl.to(items, {
              opacity: 1,
              y: 0,
              duration: STEP_DURATION,
              ease: "power3.out",
              stagger: STEP_STAGGER,
              overwrite: "auto",
            }, 0);
          }
          if (mobileCardRef.current) {
            stepTl.to(
              mobileCardRef.current,
              {
                opacity: 1,
                y: 0,
                duration: STEP_DURATION,
                ease: "power3.out",
                overwrite: "auto",
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
                overwrite: "auto",
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
                overwrite: "auto",
              },
              0.16,
            );
          }

          // Subtitle reveals with steps
          if (subtitleRef.current) {
            stepTl.to(
              subtitleRef.current,
              {
                opacity: 1,
                y: 0,
                duration: STEP_DURATION,
                ease: "power3.out",
                overwrite: "auto",
              },
              0.1,
            );
          }
        };

        const reset = () => {
          // Steps and subtitle reset smoothly
          gsap.killTweensOf(allStepElements());
          if (items.length) {
            gsap.to(items, { opacity: 0, y: STEP_RISE, duration: 0.3, ease: "power2.inOut", overwrite: "auto" });
          }
          if (lines.length) {
            gsap.to(lines, { opacity: 0, scaleX: 0, duration: 0.25, ease: "power2.inOut", overwrite: "auto" });
          }
          if (dots.length) {
            gsap.to(dots, { opacity: 0, scale: 0, duration: 0.2, ease: "power2.inOut", overwrite: "auto" });
          }
          if (mobileCardRef.current) {
            gsap.to(mobileCardRef.current, { opacity: 0, y: STEP_RISE, duration: 0.3, ease: "power2.inOut", overwrite: "auto" });
          }
          if (subtitleRef.current) {
            gsap.to(subtitleRef.current, { opacity: 0, y: STEP_RISE, duration: 0.3, ease: "power2.inOut", overwrite: "auto" });
          }
        };

        window.addEventListener(SPRAY_COMPLETE_EVENT, reveal);
        window.addEventListener(SPRAY_RESET_EVENT, reset);

        return () => {
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
      className="bg-transparent pt-14 md:pt-20 pb-4 md:pb-12 h-screen max-h-screen md:h-full md:min-h-full"
    >
      <Container className="relative z-20 flex h-full flex-1 flex-col justify-between">
        <div className="flex h-full flex-1 flex-col justify-between pb-3 md:pb-0">
          {/* Top-left heading */}
          <div className="flex max-w-xl flex-col gap-0.5 sm:gap-1 md:gap-2 shrink-0">
            <Eyebrow>The Ritual</Eyebrow>
            <RevealHeading className="text-lg sm:text-2xl md:text-section font-display uppercase tracking-tight text-balance leading-tight">
              Three moments, one lasting impression
            </RevealHeading>
            <p
              ref={subtitleRef}
              className="text-body text-muted-on-light mt-0.5 max-w-md text-[11px] sm:text-xs md:text-base leading-relaxed"
            >
              There are three moments, one lasting impression.
            </p>
          </div>

          {/* Desktop 3-step grid surrounding the bottle with callout pointer lines */}
          <ol
            ref={listRef}
            className={cn(
              "relative z-20 hidden md:grid md:top-0 md:my-auto md:w-full md:max-w-5xl lg:max-w-6xl xl:max-w-7xl md:mx-auto md:px-6 lg:px-10",
              "md:grid-cols-[1fr_minmax(220px,300px)_1fr] md:grid-rows-2",
              "md:items-center md:gap-x-2 lg:gap-x-4 md:gap-y-8 lg:gap-y-12",
            )}
          >
            {/* 01 Prime — Left side, vertically centered with bottle, line pointing right */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:items-center md:col-start-1 md:row-span-2 md:self-center md:justify-self-end">
              <div className="flex max-w-none flex-col text-left md:max-w-[220px] lg:max-w-[260px] xl:max-w-[290px]">
                <div className="flex items-baseline gap-1 md:gap-2">
                  <span className="font-display text-accent-on-light text-xl md:text-2xl lg:text-3xl leading-none font-medium">
                    {STEPS[0].num}
                  </span>
                  <h3 className="text-base md:text-lg lg:text-xl font-medium tracking-tight text-ink">
                    {STEPS[0].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 leading-relaxed text-xs md:mt-1.5 md:text-xs lg:text-sm">
                  {STEPS[0].body}
                </p>
              </div>

              {/* Callout line from Prime to bottle shoulder — elongated and responsive */}
              <div className="flex items-center ml-2 lg:ml-3 shrink-0 pointer-events-none w-[clamp(70px,8vw,140px)]">
                <svg
                  viewBox="0 0 140 28"
                  fill="none"
                  className="w-full h-auto overflow-visible stroke-accent-on-light/75 text-accent-on-light"
                >
                  <path
                    d="M 0 6 L 65 6 L 98 22 L 132 22"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ritual-line"
                  />
                  <circle
                    cx="132"
                    cy="22"
                    r="3.5"
                    fill="currentColor"
                    className="ritual-dot"
                  />
                </svg>
              </div>
            </li>

            {/* 02 Apply — Upper right, line pointing down-left to bottle collar */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:col-start-3 md:row-start-1 md:self-center md:justify-self-start">
              {/* Callout line from bottle collar to Apply — elongated and responsive */}
              <div className="flex items-center mr-2 lg:mr-3 shrink-0 pointer-events-none pt-1 w-[clamp(70px,8vw,140px)]">
                <svg
                  viewBox="0 0 140 28"
                  fill="none"
                  className="w-full h-auto overflow-visible stroke-accent-on-light/75 text-accent-on-light"
                >
                  <circle
                    cx="8"
                    cy="22"
                    r="3.5"
                    fill="currentColor"
                    className="ritual-dot"
                  />
                  <path
                    d="M 8 22 L 42 22 L 75 6 L 140 6"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ritual-line"
                  />
                </svg>
              </div>

              <div className="flex max-w-none flex-col text-left md:max-w-[220px] lg:max-w-[260px] xl:max-w-[290px]">
                <div className="flex items-baseline gap-1 md:gap-2">
                  <span className="font-display text-accent-on-light text-xl md:text-2xl lg:text-3xl leading-none font-medium">
                    {STEPS[1].num}
                  </span>
                  <h3 className="text-base md:text-lg lg:text-xl font-medium tracking-tight text-ink">
                    {STEPS[1].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 leading-relaxed text-xs md:mt-1.5 md:text-xs lg:text-sm">
                  {STEPS[1].body}
                </p>
              </div>
            </li>

            {/* 03 Layer — Lower right, line pointing left to lower bottle body */}
            <li className="flex min-w-0 flex-col md:flex-row items-start md:col-start-3 md:row-start-2 md:self-center md:justify-self-start">
              {/* Callout line from bottle body to Layer — elongated and responsive */}
              <div className="flex items-center mr-2 lg:mr-3 shrink-0 pointer-events-none pt-1 w-[clamp(70px,8vw,140px)]">
                <svg
                  viewBox="0 0 140 20"
                  fill="none"
                  className="w-full h-auto overflow-visible stroke-accent-on-light/75 text-accent-on-light"
                >
                  <circle
                    cx="8"
                    cy="10"
                    r="3.5"
                    fill="currentColor"
                    className="ritual-dot"
                  />
                  <path
                    d="M 8 10 L 50 10 L 95 10 L 140 10"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ritual-line"
                  />
                </svg>
              </div>

              <div className="flex max-w-none flex-col text-left md:max-w-[220px] lg:max-w-[260px] xl:max-w-[290px]">
                <div className="flex items-baseline gap-1 md:gap-2">
                  <span className="font-display text-accent-on-light text-xl md:text-2xl lg:text-3xl leading-none font-medium">
                    {STEPS[2].num}
                  </span>
                  <h3 className="text-base md:text-lg lg:text-xl font-medium tracking-tight text-ink">
                    {STEPS[2].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 leading-relaxed text-xs md:mt-1.5 md:text-xs lg:text-sm">
                  {STEPS[2].body}
                </p>
              </div>
            </li>
          </ol>

          {/* Mobile Interactive Step Tabs Card (Applies ONLY to the 3 ritual steps) */}
          <div
            ref={mobileCardRef}
            className="relative z-50 flex flex-col md:hidden pointer-events-auto mt-auto mb-2 sm:mb-4 md:mb-0 touch-manipulation select-none"
          >
            <div className="border-hairline-on-light bg-bg-light/95 backdrop-blur-md rounded-2xl border p-2 sm:p-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <div className="grid grid-cols-3 gap-1 border-b border-hairline-on-light pb-1.5">
                {STEPS.map((step, idx) => {
                  const active = idx === activeStep;
                  return (
                    <button
                      key={step.num}
                      type="button"
                      onClick={() => setActiveStep(idx)}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-lg py-1.5 px-1 transition-all text-[11px] uppercase tracking-wider cursor-pointer active:scale-95",
                        active
                          ? "bg-accent-on-light text-white font-semibold shadow-xs"
                          : "bg-black/[0.03] text-muted-on-light hover:text-ink font-medium active:bg-black/[0.06]",
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

              <div key={activeStep} className="pt-1.5 min-h-[2.25rem] transition-opacity duration-200">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-accent-on-light text-sm sm:text-base leading-none font-medium">
                    {STEPS[activeStep].num}
                  </span>
                  <h3 className="text-xs font-medium tracking-tight text-ink">
                    {STEPS[activeStep].title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-0.5 text-[11px] leading-snug">
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
