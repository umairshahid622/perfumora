"use client";

import { useEffect, useState } from "react";

/**
 * Generic media-query subscription, used to adapt 3D cost per breakpoint (§2.6).
 * Initialised synchronously so client-only trees get the right value on first
 * paint rather than rendering the desktop configuration and correcting it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", onChange);

    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
