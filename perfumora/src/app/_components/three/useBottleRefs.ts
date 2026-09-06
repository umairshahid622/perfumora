"use client";

import { useMemo, useRef, type RefObject } from "react";
import type {
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  PointsMaterial,
} from "three";

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
  /**
   * The pump's press button, revealed once the closure lifts — its dip is what
   * causes the spray. Typed as loosely as the cap, and for the same reason.
   */
  pumpButton: RefObject<Object3D | null>;
  /**
   * The spray itself, which is scenery rather than a part of the product: a
   * cloud of points parked at the nozzle (see `BottleMist`), expanded away from
   * it by its own scale. Kept on this one object so the choreography has a
   * single channel into the canvas. Split from its material for the reason the
   * fragrance is — a timeline needs the opacity as well as the transform.
   */
  mist: RefObject<Object3D | null>;
  mistMaterial: RefObject<PointsMaterial | null>;
  /**
   * Group wrapping the model and mist for scroll-driven tilt and showcase pose.
   * Keeps tilt independent of the variant spin on root.
   */
  tiltGroup: RefObject<Group | null>;
}

export function useBottleRefs(): BottleRefs {
  const root = useRef<Group | null>(null);
  const glass = useRef<Mesh | null>(null);
  const liquid = useRef<Mesh | null>(null);
  const liquidMaterial = useRef<MeshPhysicalMaterial | null>(null);
  const dipTube = useRef<Mesh | null>(null);
  const cap = useRef<Object3D | null>(null);
  const pumpButton = useRef<Object3D | null>(null);
  const mist = useRef<Object3D | null>(null);
  const mistMaterial = useRef<PointsMaterial | null>(null);
  const tiltGroup = useRef<Group | null>(null);

  // Stable identity, so the assembly can wire these up in an effect without
  // re-running it on every render.
  return useMemo(
    () => ({
      root,
      glass,
      liquid,
      liquidMaterial,
      dipTube,
      cap,
      pumpButton,
      mist,
      mistMaterial,
      tiltGroup,
    }),
    [
      root,
      glass,
      liquid,
      liquidMaterial,
      dipTube,
      cap,
      pumpButton,
      mist,
      mistMaterial,
      tiltGroup,
    ],
  );
}
