"use client";

import { useMemo, useRef, type RefObject } from "react";
import type { Group, Mesh, MeshPhysicalMaterial, Object3D } from "three";

/**
 * The handles GSAP will tween later (spin, liquid colour, camera moves). The
 * 3D components own no animation logic of their own (§5) — they only expose
 * these refs, so every motion stays authored in a GSAP timeline.
 */
export interface BottleRefs {
  /** Whole assembly, centred on the origin — the spin target. */
  root: RefObject<Group | null>;
  glass: RefObject<Mesh | null>;
  liquid: RefObject<Mesh | null>;
  /** Liquid material, for the per-variant colour tween. */
  liquidMaterial: RefObject<MeshPhysicalMaterial | null>;
  dipTube: RefObject<Mesh | null>;
  /** Closure. Typed loosely: in the glTF the `cap` node is itself a mesh. */
  cap: RefObject<Object3D | null>;
}

export function useBottleRefs(): BottleRefs {
  const root = useRef<Group | null>(null);
  const glass = useRef<Mesh | null>(null);
  const liquid = useRef<Mesh | null>(null);
  const liquidMaterial = useRef<MeshPhysicalMaterial | null>(null);
  const dipTube = useRef<Mesh | null>(null);
  const cap = useRef<Object3D | null>(null);

  // Stable identity, so the assembly can wire these up in an effect without
  // re-running it on every render.
  return useMemo(
    () => ({ root, glass, liquid, liquidMaterial, dipTube, cap }),
    [root, glass, liquid, liquidMaterial, dipTube, cap],
  );
}
