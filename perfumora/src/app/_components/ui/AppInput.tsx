"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";

/**
 * <AppInput> — the site's one form field (§4.0), replacing the bare underline that
 * <AuthModal>, <ContactForm> and <Checkout> each restated inline. A boxed, gently
 * recessed field on the parchment whose label rests centred like a placeholder and
 * rides up to a micro-cap eyebrow on focus or once it holds a value, with the
 * per-type affordances a considered form wants: a reveal toggle on `password`, a
 * `+92` prefix on `tel`, a sizable `textarea`. UI only — it forwards value/onChange
 * and native validation and adds no submission of its own (§1).
 *
 * The motion is authored in GSAP, not CSS (§6.3), like the rest of the site: the
 * label tweens up and to the accent, and on focus an accent border draws itself
 * around the field from the top-left corner all the way round, after which a soft
 * `--accent-glow` ring blooms out of the box. The border is an SVG `<rect>` drawn
 * with `stroke-dashoffset` and `pathLength="1"`, so the one normalised tween works
 * at any field or textarea size with nothing to measure. Reduced motion collapses
 * every duration to zero, so the same tweens just set the resolved state.
 *
 * Class strings that pair a type-scale token with a colour are plain literals,
 * never `cn()`: tailwind-merge files `text-micro`/`text-base` in the same group as
 * `text-<colour>` and drops one — the footgun the old inline constants worked
 * around. The label's colour and size are GSAP's to set, so they live off-class.
 */
type AppInputVariant = "text" | "email" | "password" | "tel" | "textarea";

interface AppInputProps {
  label: string;
  variant?: AppInputVariant;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Marks the one field a customer may leave blank; shows a quiet "Optional" tag. */
  optional?: boolean;
  autoComplete?: string;
  name?: string;
  /** `textarea` only — initial visible rows. */
  rows?: number;
  /** Outer layout only (column span, width); the field chrome is owned here. */
  className?: string;
}

const INPUT_TYPE: Record<AppInputVariant, string> = {
  text: "text",
  email: "email",
  password: "password",
  tel: "tel",
  textarea: "text",
};

/** The reveal toggle's glyph — an eye, struck through when the value is showing. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="m4 4 16 16" />}
    </svg>
  );
}

export function AppInput({
  label,
  variant = "text",
  value,
  defaultValue,
  onChange,
  placeholder,
  required,
  optional,
  autoComplete,
  name,
  rows = 4,
  className,
}: AppInputProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);
  const borderRef = useRef<SVGRectElement>(null);
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  // Uncontrolled fields (AuthModal/ContactForm) have no `value`, so the float can't
  // read one — track "has content" locally instead. Controlled callers drive it off `value`.
  const [dirty, setDirty] = useState((defaultValue ?? "").length > 0);

  const controlled = value !== undefined;
  const filled = controlled ? value.length > 0 : dirty;
  const floated = focused || filled;
  const isArea = variant === "textarea";
  const isTel = variant === "tel";
  const isPassword = variant === "password";
  // The label's resting seat: centred in the single-line box, but on the first
  // text line for the taller textarea. Floated, both rise to the same eyebrow.
  const restTop = isArea ? "1.5rem" : "1.25rem";

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!controlled) setDirty(event.target.value.length > 0);
    onChange?.(event.target.value);
  };

  useGSAP(
    () => {
      // GSAP can't interpolate raw `var(...)`, so read the live values off the
      // root — they're swapped per variant by <ScentProvider>, same as Navigation.
      const cs = getComputedStyle(document.documentElement);
      const accent = cs.getPropertyValue("--accent-on-light").trim();
      const muted = cs.getPropertyValue("--muted-on-light").trim();
      const glow = cs.getPropertyValue("--accent-glow").trim();
      // Reduced motion keeps the same end-states; only the travel to them is cut.
      const t = prefersReducedMotion() ? 0 : 1;

      // Label: rides between its resting seat and the micro-cap eyebrow. Keyed on
      // `floated` (focus OR content), so a filled-but-blurred field stays lifted.
      gsap.to(labelRef.current, {
        top: floated ? "0.5rem" : restTop,
        fontSize: floated ? "0.75rem" : "1rem",
        letterSpacing: floated ? "0.14em" : "0em",
        color: focused ? accent : muted,
        duration: 0.35 * t,
        ease: "power3.out",
        overwrite: "auto",
      });

      // Focus chrome is keyed on `focused` alone: on focus the accent border draws
      // itself around the field (dashoffset 1 → 0), then a soft same-hue glow blooms
      // once the line has all but closed; on blur the glow lifts and the border
      // retracts. Border stroke and glow share `--accent`, and the glow carries real
      // blur, so the halo reads as a bloom of the border rather than a second ring.
      if (focused) {
        gsap.to(borderRef.current, {
          strokeDashoffset: 0,
          duration: 0.5 * t,
          ease: "power2.inOut",
          overwrite: "auto",
        });
        gsap.to(boxRef.current, {
          boxShadow: `0 0 9px 1px ${glow}`,
          duration: 0.3 * t,
          delay: 0.4 * t,
          ease: "power2.out",
          overwrite: "auto",
        });
      } else {
        gsap.to(boxRef.current, {
          boxShadow: `0 0 0px 0px ${glow}`,
          duration: 0.25 * t,
          ease: "power2.in",
          overwrite: "auto",
        });
        gsap.to(borderRef.current, {
          strokeDashoffset: 1,
          duration: 0.4 * t,
          ease: "power2.in",
          overwrite: "auto",
        });
      }
    },
    { dependencies: [floated, focused], scope: rootRef },
  );

  const horiz = isTel
    ? floated
      ? "pl-14 pr-4"
      : "px-4"
    : isPassword
      ? "pl-4 pr-12"
      : "px-4";
  const vert = isArea ? "pt-6 pb-3" : "pt-6 pb-2";
  const field = `w-full resize-none bg-transparent ${horiz} ${vert} text-base text-ink outline-none placeholder:text-transparent focus:placeholder:text-muted-on-light`;

  const shared = {
    id,
    name,
    required,
    autoComplete,
    placeholder,
    value,
    defaultValue,
    onChange: handleChange,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    className: field,
  };

  return (
    <div ref={rootRef} className={cn("block", className)}>
      <div
        ref={boxRef}
        className="border-hairline-on-light bg-ink/[0.03] relative rounded-xl border"
      >
        {isArea ? (
          <textarea {...shared} rows={rows} />
        ) : (
          <input
            {...shared}
            type={isPassword && reveal ? "text" : INPUT_TYPE[variant]}
            inputMode={
              isTel ? "tel" : variant === "email" ? "email" : undefined
            }
          />
        )}

        {/* The resting label doubles as the placeholder; GSAP owns its top/size/
            colour, so the inline style only seeds the first paint (the rest seat)
            and is never rewritten by React across renders. */}
        <label
          ref={labelRef}
          htmlFor={id}
          className={`text-muted-on-light pointer-events-none absolute left-4 leading-none ${
            floated ? "uppercase" : ""
          }`}
          style={{ top: restTop, fontSize: "1rem", letterSpacing: "0em" }}
        >
          {label}
        </label>

        {/* The drawn accent border. `pathLength="1"` normalises the perimeter, so
            the one dashoffset tween draws it at any size; `width/height="100%"`
            keeps it locked to the box as a textarea grows — nothing to measure.
            `overflow-visible` lets the outer half of the stroke sit on the edge. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <rect
            ref={borderRef}
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="12"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
          />
        </svg>

        {isTel && floated && (
          <span className="text-muted-on-light pointer-events-none absolute top-6 left-4 text-base leading-6">
            +92
          </span>
        )}

        {isPassword && filled && (
          <button
            type="button"
            // Preventing the default mousedown keeps focus on the input, so the
            // field doesn't blur (border/glow retract) just from toggling reveal.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="text-muted-on-light hover:text-accent-on-light absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
          >
            <EyeIcon off={reveal} />
          </button>
        )}

        {optional && (
          <span className="text-micro text-muted-on-light pointer-events-none absolute top-2 right-4 font-medium tracking-[0.14em] uppercase">
            Optional
          </span>
        )}
      </div>
    </div>
  );
}
