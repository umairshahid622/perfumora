"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../_lib/motion";
import { cn } from "../../_lib/cn";

interface RollingNumberProps {
  value: number;
  className?: string;
  containerClassName?: string;
}

/**
 * Animated rolling number counter:
 * On increment: next number comes from DOWN (enters from +100% -> 0%, old exits to -100%).
 * On decrement: previous number comes from UP (enters from -100% -> 0%, old exits to +100%).
 */
export function RollingNumber({
  value,
  className = "text-xs font-medium text-ink",
  containerClassName = "h-5 w-6",
}: RollingNumberProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef(value);

  useGSAP(
    () => {
      const prev = prevValueRef.current;
      if (prev === value) return;
      const isInc = value > prev;
      prevValueRef.current = value;

      const container = containerRef.current;
      const current = currentRef.current;
      if (!container || !current) return;

      if (prefersReducedMotion()) return;

      // Remove any previously animating outgoing elements
      container.querySelectorAll(".rolling-outgoing").forEach((el) => el.remove());

      // Outgoing element holding the previous number
      const outgoing = document.createElement("span");
      outgoing.className = cn(
        "rolling-outgoing pointer-events-none absolute inset-0 flex items-center justify-center leading-none",
        className,
      );
      outgoing.textContent = String(prev);
      container.appendChild(outgoing);

      const incomingStart = isInc ? 100 : -100;
      const outgoingEnd = isInc ? -100 : 100;

      // Animate outgoing number out
      gsap.fromTo(
        outgoing,
        { yPercent: 0, opacity: 1 },
        {
          yPercent: outgoingEnd,
          opacity: 0,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => {
            outgoing.remove();
          },
        },
      );

      // Animate incoming number in
      gsap.fromTo(
        current,
        { yPercent: incomingStart, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.28,
          ease: "power2.out",
          overwrite: "auto",
        },
      );
    },
    { scope: containerRef, dependencies: [value] },
  );

  return (
    <span
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden tabular-nums select-none",
        containerClassName,
      )}
    >
      <span
        ref={currentRef}
        className={cn(
          "absolute inset-0 flex items-center justify-center leading-none",
          className,
        )}
      >
        {value}
      </span>
    </span>
  );
}
