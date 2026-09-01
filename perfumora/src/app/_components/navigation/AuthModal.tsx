"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { AppInput } from "../ui/AppInput";
import { RippleButton } from "../ui/RippleButton";
import { CloseIcon } from "./icons";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "login" | "signup";

/**
 * Auth modal (§4.0): a centered overlay that scales/fades in via GSAP (scrim
 * fade + card 0.95 → 1, opacity 0 → 1), not a native <dialog>. Minimal email /
 * password fields with a login⇄signup toggle. UI ONLY — local `useState`, no
 * submission, no validation logic, no auth SDK (§1). Submit shows a static
 * success state and closes.
 */
export function AuthModal({ open, onClose }: AuthModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [done, setDone] = useState(false);

  useGSAP(
    () => {
      gsap.set(scrimRef.current, { autoAlpha: 0 });
      gsap.set(cardRef.current, { autoAlpha: 0, scale: 0.95 });
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      tl.to(scrimRef.current, { autoAlpha: 1, duration: 0.35 }, 0).to(
        cardRef.current,
        { autoAlpha: 1, scale: 1, duration: 0.45 },
        0.05,
      );
      timeline.current = tl;
    },
    { scope: rootRef },
  );

  useEffect(() => {
    const tl = timeline.current;
    if (!tl) return;
    if (prefersReducedMotion()) {
      tl.progress(open ? 1 : 0).pause();
      return;
    }
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  useEffect(() => {
    if (open) setDone(false);
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // UI-only: nothing is sent anywhere (§1).
    setDone(true);
  };

  return (
    <div ref={rootRef} aria-hidden={!open}>
      <button
        ref={scrimRef}
        type="button"
        aria-label="Close"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={mode === "login" ? "Log in" : "Create account"}
          className={cn(
            "bg-bg-light text-ink relative w-full max-w-md rounded-3xl p-8 md:p-10",
            open ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink hover:text-accent-on-light absolute top-6 right-6 transition-colors"
          >
            <CloseIcon className="size-5" />
          </button>

          <h2 className="text-3xl font-medium tracking-tight normal-case">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-micro text-muted-on-light mt-2 font-medium uppercase">
            {mode === "login" ? "Log in to continue" : "Join Perfumora"}
          </p>

          {done ? (
            <p className="text-body text-muted-on-light mt-10">
              You&rsquo;re all set. {/* Static success — no account is created. */}
            </p>
          ) : (
            <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
              <AppInput
                label="Email"
                variant="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
              <AppInput
                label="Password"
                variant="password"
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />

              <RippleButton type="submit" className="mt-2 w-full" silent>
                {mode === "login" ? "Log in" : "Sign up"}
              </RippleButton>
            </form>
          )}

          {!done && (
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-micro text-muted-on-light hover:text-ink mt-6 font-medium uppercase transition-colors"
            >
              {mode === "login"
                ? "Need an account? Sign up"
                : "Have an account? Log in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
