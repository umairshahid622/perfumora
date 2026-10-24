import { cn } from "../../_lib/cn";
import type { Tone } from "./Section";

/**
 * A clearly-labelled stand-in for imagery that hasn't been supplied yet (§0:
 * assets are never invented). It reads "asset pending" on purpose so a grey box
 * is never mistaken for a final photograph. Swap for <Image> once real art
 * arrives; the layout (aspect ratio via className) stays the same.
 */
export function ImagePlaceholder({
  label = "Image",
  tone = "light",
  className,
}: {
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border",
        tone === "light"
          ? "border-border bg-surface-sunken"
          : "border-border bg-secondary",
        className,
      )}
    >
      <span
        className={cn(
          "text-micro px-4 text-center font-medium uppercase",
          tone === "light" ? "text-muted-on-light" : "text-muted-on-dark",
        )}
      >
        {label} · asset pending
      </span>
    </div>
  );
}
