import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes: `clsx` resolves conditionals, `tailwind-merge`
 * resolves conflicting utilities so later classes win (§1 Styling).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
