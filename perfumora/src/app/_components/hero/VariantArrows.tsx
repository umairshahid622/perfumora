"use client";

import { useSoundCue } from "../../_hooks/useSoundCue";
import { useScent } from "../../_lib/scent-context";
import { ArrowIcon } from "../navigation/icons";

/**
 * The fragrance changer's controls (§4.1). Prev/next step the live variant in
 * <ScentProvider>, which re-syncs the accent tokens across the page. Each press
 * fires the shared click cue via `useSoundCue` (§1) — a short one-shot from a
 * real gesture, no sound library. The clip is a user-supplied asset, so it stays
 * silent until the file is in place.
 *
 * NOTE: the cinematic spin + mid-turn colour shift + sparkle on the 3D bottle is
 * the fragrance-changer timeline (§6.3 #10), layered on later. These buttons only
 * change state today.
 */
export function VariantArrows() {
  const { next, prev } = useScent();
  const { play } = useSoundCue(); // shared click cue on every step

  const step = (fn: () => void) => {
    fn();
    play();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Previous fragrance"
        onClick={() => step(prev)}
        className="border-hairline-on-light text-ink hover:border-accent-on-light hover:text-accent-on-light pointer-events-auto absolute top-1/2 left-0 grid size-12 -translate-y-1/2 place-items-center rounded-full border transition-colors md:size-14"
      >
        <ArrowIcon className="size-5 rotate-180" />
      </button>
      <button
        type="button"
        aria-label="Next fragrance"
        onClick={() => step(next)}
        className="border-hairline-on-light text-ink hover:border-accent-on-light hover:text-accent-on-light pointer-events-auto absolute top-1/2 right-0 grid size-12 -translate-y-1/2 place-items-center rounded-full border transition-colors md:size-14"
      >
        <ArrowIcon className="size-5" />
      </button>
    </>
  );
}

/**
 * The position-dot indicator (§4.1), one dot per SKU. Doubles as a jump control —
 * clicking a dot selects that variant directly. The active dot fills with the
 * live accent. Wraps to multiple centred rows once the collection outgrows a
 * single row (it is well past four now).
 */
export function VariantDots() {
  const { index, count, setIndex } = useScent();
  const { play } = useSoundCue();
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Fragrance ${i + 1}`}
          aria-current={i === index}
          onClick={() => {
            setIndex(i);
            play();
          }}
          className="grid size-6 place-items-center"
        >
          <span
            className={cnDot(i === index)}
            style={i === index ? { backgroundColor: "var(--accent-on-light)" } : undefined}
          />
        </button>
      ))}
    </div>
  );
}

function cnDot(active: boolean) {
  return active
    ? "block size-2.5 rounded-full"
    : "border-hairline-on-light block size-2.5 rounded-full border";
}
