"use client";

import dynamic from "next/dynamic";
import type { BottleSceneProps } from "./BottleScene";

/**
 * Client-only mount point for the 3D scene. `next/dynamic` with `ssr: false`
 * keeps three.js out of the server render and out of the initial bundle (§5) —
 * `ssr: false` is only valid inside a Client Component, which is why this thin
 * wrapper exists instead of importing dynamically from the page.
 *
 * No `loading` fallback: the first-load curtain (`AppLoader`) already covers the
 * whole viewport while everything downloads, so a second in-slot indicator here
 * would only ever flash behind it. An empty slot is what should sit under the
 * curtain.
 */
const BottleScene = dynamic(() => import("./BottleScene"), {
  ssr: false,
});

export function BottleSceneMount(props: BottleSceneProps) {
  return <BottleScene {...props} />;
}
