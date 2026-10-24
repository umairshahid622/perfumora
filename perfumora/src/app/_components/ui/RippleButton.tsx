"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useSoundCue } from "../../_hooks/useSoundCue";

interface RippleButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  silent?: boolean;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

const EXPAND_DURATION = 0.55;
const COLLAPSE_DURATION = 0.4;
const LABEL_DURATION = 0.22;
const LABEL_DELAY = 0.12;

export function RippleButton({
  children,
  onClick,
  type = "button",
  className,
  silent = false,
  disabled = false,
  ...rest
}: RippleButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const restingColor = useRef("");

  const { play } = useSoundCue();
  const handleClick = () => {
    if (disabled) return;
    if (!silent) play();
    onClick?.();
  };

  const handleEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    const fill = fillRef.current;
    const label = labelRef.current;
    if (!el || !fill || !label || disabled || prefersReducedMotion()) return;

    gsap.set(label, { clearProps: "color" });
    restingColor.current = getComputedStyle(label).color;

    const rect = el.getBoundingClientRect();

    gsap.set(fill, {
      width: Math.hypot(rect.width, rect.height) * 2,
      height: Math.hypot(rect.width, rect.height) * 2,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      xPercent: -50,
      yPercent: -50,
      scale: 0,
    });

    gsap.to(fill, {
      scale: 1,
      duration: EXPAND_DURATION,
      ease: "power2.out",
      overwrite: true,
    });

    gsap.to(label, {
      color: getComputedStyle(el).getPropertyValue("--accent").trim(),
      duration: LABEL_DURATION,
      delay: LABEL_DELAY,
      ease: "power2.out",
      overwrite: true,
    });
  };

  const handleLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    const fill = fillRef.current;
    const label = labelRef.current;
    if (!el || !fill || !label || disabled || prefersReducedMotion()) return;

    const rect = el.getBoundingClientRect();
    gsap.set(fill, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });

    gsap.to(fill, {
      scale: 0,
      duration: COLLAPSE_DURATION,
      ease: "power2.in",
      overwrite: true,
    });

    gsap.to(label, {
      color: restingColor.current || "#ffffff",
      duration: LABEL_DURATION,
      ease: "power2.out",
      overwrite: true,
      onComplete: () => gsap.set(label, { clearProps: "color" }),
    });
  };

  const handleBlur = () => {
    if (ref.current?.matches(":hover")) return;
    const el = ref.current;
    const fill = fillRef.current;
    const label = labelRef.current;
    if (!el || !fill || !label) return;
    gsap.to(fill, { scale: 0, duration: COLLAPSE_DURATION, overwrite: true });
    gsap.to(label, {
      color: restingColor.current || "#ffffff",
      duration: LABEL_DURATION,
      overwrite: true,
      onComplete: () => gsap.set(label, { clearProps: "color" }),
    });
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerLeave={handleLeave}
      onBlur={handleBlur}
      className={cn(
        "bg-accent text-white ring-1 ring-accent relative inline-flex items-center justify-center overflow-hidden rounded-full shadow-xs transition-shadow hover:shadow-md",
        "px-4 md:px-9 py-3 md:py-4 text-[0.8rem] font-semibold uppercase tracking-widest",
        "select-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className,
      )}
      {...rest}
    >
      <span
        ref={fillRef}
        aria-hidden="true"
        className="bg-background pointer-events-none absolute top-0 left-0 rounded-full will-change-transform"
      />
      <span ref={labelRef} className="relative z-10">
        {children}
      </span>
    </button>
  );
}
