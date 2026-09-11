"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { NeutralToneMapping, Color, Box3, Vector3, type Object3D } from "three";
import { readCssToken } from "../../_lib/css-token";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";
import { juiceColor } from "../../_lib/variants";
import { useMediaQuery } from "../../_hooks/useMediaQuery";
import { BottleGltf } from "./BottleGltf";
import { BottleMist } from "./BottleMist";
import { StudioEnvironment } from "./StudioEnvironment";
import { useBottleRefs } from "./useBottleRefs";
import { useBottleFloat } from "./useBottleFloat";
import { useBottleUncap } from "./useBottleUncap";
import { useScrollScene } from "./useScrollScene";

gsap.registerPlugin(ScrollTrigger);

/**
 * One full turn per fragrance change. A whole revolution rather than a part of
 * one so the bottle always comes to rest in the orientation it started in — a
 * partial turn would leave every change a little further round than the last.
 */
const SPIN_TURN = Math.PI * 2;
const SPIN_DURATION = 0.9;

/**
 * The colour cross-fade is shorter than the spin and centred inside it. With a
 * symmetric ease the bottle is exactly half a turn round at the spin's midpoint —
 * facing away — so the fragrance changes hue behind its own back and you only
 * ever see the new colour arrive as it turns to face you again.
 */
const COLOUR_DURATION = 0.4;
const COLOUR_START = (SPIN_DURATION - COLOUR_DURATION) / 2;

/**
 * Where the vessel rests — one pose, held for the whole page.
 *
 * Units are the canvas's own (camera z 7.2, 24° fov → ~3.06 world units of visible
 * height, so one unit ≈ 33vh and a bottle of `scale` s stands ~85·s vh tall). Both
 * values are set against the empty slot the Hero reserves rather than the middle of
 * the viewport, because that section puts furniture beneath it — the position counter
 * and the product bar. They are the first knobs to check on a real screen.
 *
 * Two of them because a phone has to hold the same copy in a third of the width, so
 * the Hero's reserved box is the tighter one there (`h-[46vh]` against `md:h-[60vh]`)
 * and the vessel sits higher and smaller to stay inside it.
 *
 * X and Y rotation are left at the identity pose, so they are not stated: the bottle
 * faces the camera dead centre and only the variant-change spin below turns it.
 */
const REST = { y: -0.22, scale: 0.78 };
const REST_TABLET = { y: -0.20, scale: 0.72 };
const REST_COMPACT = { y: -0.18, scale: 0.62 };

export interface BottleSceneProps {
  /** Variant colour for the fragrance; defaults to the live `--accent` token. */
  liquidColor?: string;
  /** Live variant position. A change in it is what triggers the spin. */
  variantIndex: number;
  /** Which way that change travelled (+1 forward, -1 back) — the spin's sign. */
  spinDirection: number;
  className?: string;
}

/**
 * Owns the canvas, camera, lighting and tone mapping — the studio the product
 * is photographed in. A long lens (24° fov) keeps the silhouette straight-sided
 * like the reference shot instead of splaying it with wide-angle perspective.
 *
 * This is the site's single persistent bottle: mounted once (by `PersistentBottle`)
 * over the whole home route and never unmounted, so the model exists exactly once
 * and one WebGL context, one glTF and one environment map serve the page.
 *
 * The vessel is parked at `REST` and stays there: nothing here moves the
 * assembly with the scroll. Two motions act on it, and both are events rather
 * than journeys — the variant-change spin below, which a press on the Hero's
 * arrows drives, and the Ritual's uncapping (`useBottleUncap`), which the beat's
 * own screen of scroll cues and which then plays at its own pace. Through the
 * Hero and the Manifesto the bottle is dead still. The idle float is wired but
 * switched off (see its call), which is what the Hero showed anyway; it is one
 * word away if the next idea wants it back. None of this motion is authored
 * inside the 3D components themselves (§5): they expose refs and GSAP does the
 * work. The canvas is transparent so the DOM layers show behind it (§4.1).
 */
export default function BottleScene({
  liquidColor,
  variantIndex,
  spinDirection,
  className,
}: BottleSceneProps) {
  const refs = useBottleRefs();
  // Flipped once the glTF resolves and `refs.root` is wired, so a motion that needs
  // the assembly root can start against one that exists — the model loads well after
  // first render, and that resolution doesn't re-run the hooks here on its own.
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  // Whether the canvas's host box is intersecting the viewport at all. The bottle
  // lives only in the opening stage; once that block has scrolled away this layer
  // is off-screen for good, yet `always` below would keep rendering it — an empty
  // full-viewport alpha+MSAA clear every frame for the whole page below. Watching
  // the *host* (below) rather than the canvas keeps this independent of what
  // `position` games the stage's wrappers play on their own children.
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  // On-demand frames while idle, continuous while anything can be seen to move.
  // `always` is still required whenever the layer is visible: the variant spin,
  // the scroll-scrubbed tilt and the Ritual's spray are all authored in GSAP,
  // which writes transforms on GSAP's own ticker — R3F has no way to know about
  // them, so without a frame every tick the canvas would sit still while the
  // objects moved underneath. But off-screen there is nothing to move that anyone
  // can see, and `demand` frees the GPU to composite the page's own scrolling.
  // (Switching frameloop dynamically is supported — R3F routes a changed prop
  // through `setFrameloop`, which parks or resumes the internal loop cleanly.)
  const frameloop = visible ? "always" : "demand";
  const isCompact = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery(
    "(min-width: 768px) and (max-width: 1200px)",
  );
  const accent = liquidColor ?? readCssToken("--accent", "#b87333");
  // The 3D liquid renders a treated variant colour: a pale juice's faint hue is
  // amplified so it reads as tinted clear liquid, not dead white; saturated juices
  // pass through unchanged (see `juiceColor`). Opacity is uniform across variants,
  // set on the material itself, so only the colour changes here.
  const juice = juiceColor(accent);
  const firstRun = useRef(true);
  // Portrait viewports rest higher and smaller — see `REST_COMPACT`.
  const rest = isCompact ? REST_COMPACT : isTablet ? REST_TABLET : REST;

  /**
   * The change timeline (§6.3 #10): the bottle turns the way the arrow pointed
   * and the fragrance cross-fades to the new colour mid-turn. Positive
   * `rotation.y` carries the face toward +X, which is the viewer's right, so the
   * sign of `spinDirection` maps straight onto "which arrow was pressed".
   *
   * The camera is left alone deliberately — spinning the model rather than moving
   * a camera rig keeps this independent of the scroll travel on the dock group
   * outside it.
   */
  useGSAP(
    () => {
      const root = refs.root.current;
      const material = refs.liquidMaterial.current;
      const snap = firstRun.current || prefersReducedMotion();
      firstRun.current = false;

      // `root` is null until the glTF resolves inside <Suspense> below, and the
      // first paint is not a change worth marking. Either way the colour still
      // has to be right, so it lands without the journey — that is also what
      // reduced motion should get.
      if (snap || !root) {
        material?.color.set(juice);
        return;
      }

      // A press mid-change redirects the spin from wherever it has got to.
      // `"auto"` (not `true`): it overwrites only the conflicting `rotation.y` of a
      // spin still running, so a redirect works — but it leaves the idle float's
      // `rotation.z` roll on this same object alone, which `true` would have killed.
      const tl = gsap.timeline();

      tl.to(
        root.rotation,
        {
          y: root.rotation.y + spinDirection * SPIN_TURN,
          duration: SPIN_DURATION,
          ease: "power2.inOut",
          overwrite: "auto",
        },
        0,
      );

      if (material) {
        // `Color` applies three's sRGB → linear-sRGB conversion, matching the
        // working space `material.color` already holds, so the channels
        // interpolate in linear light — a touch brighter through the midpoint
        // than lerping the gamma-encoded values would be.
        const target = new Color(juice);
        tl.to(
          material.color,
          {
            r: target.r,
            g: target.g,
            b: target.b,
            duration: COLOUR_DURATION,
            ease: "power1.inOut",
            overwrite: true,
          },
          COLOUR_START,
        );
      }
    },
    // Deliberately keyed on the index alone: `spinDirection` changing on its own
    // (a dot jump that lands on the current variant) is not a change to mark.
    { dependencies: [variantIndex] },
  );

  // Ambient idle drift (§6.3 #9), on the assembly root — wired, but off. It used to
  // be gated by a ScrollTrigger to the Manifesto → Ritual span, which meant it never
  // ran while the Hero was on screen; now that the Hero is the only beat the bottle
  // has, that gate would have been the last piece of scroll-driven motion left, and
  // switching the hook off keeps exactly the stillness the Hero always showed. Its
  // `enabled` flag is the hook's own opt-in, so this is a one-word change to revisit.
  useBottleFloat(refs, { enabled: false, ready });

  // The Ritual's theatre: the closure lifts off, the pump fires, the fragrance
  // hangs in the air (§4.3). Cued by the beat's own screen of the document — the
  // one screen `<OpeningStage>` holds still for reading — and played from there,
  // because a spray is an event and not a state to be scrubbed. The DOM half of
  // the same sequence, the three steps that arrive once the mist is up, is in
  // `<Ritual>`.
  useBottleUncap(refs, {
    enabled: true,
    ready,
    trigger: `#${SECTION_IDS.ritual}`,
  });

  // Master scrubbed tilt choreography across the opening stage:
  // 0.0 -> 0.6 screens: Leans into Manifesto pose (y: -0.14, z: -0.16)
  // 0.6 -> 1.4 screens: Holds lean while reading Manifesto
  // 1.4 -> 2.0 screens: Returns upright (0, 0, 0) as Ritual enters
  // 2.0 -> 3.0 screens: Remains upright while Ritual uncapping and spray mist happen
  // 3.0 -> 3.8 screens: Tilts to the showcase angle (x: 0.1, y: 0.35, z: 0.28) as cap glides shut
  useGSAP(
    () => {
      const tiltGroup = refs.tiltGroup.current;
      const stageEl = document.querySelector<HTMLElement>("[data-opening-stage]");
      if (!ready || !tiltGroup || !stageEl || prefersReducedMotion()) return;

      gsap.set(tiltGroup.rotation, { x: 0, y: 0, z: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stageEl,
          start: "top top",
          end: () => `+=${window.innerHeight * 4}`,
          scrub: 1.2,
        },
      });

      const beat = { ease: "power1.inOut" };

      tl
        // 0.0 -> 0.6 screens (0vh -> 60vh): Tilt into Manifesto lean as bottle drifts right
        .to(tiltGroup.rotation, { y: -0.14, z: -0.16, duration: 0.6, ...beat }, 0)
        // 0.6 -> 1.4 screens (60vh -> 140vh): Held tilted during Manifesto reading
        // 1.4 -> 2.0 screens (140vh -> 200vh): Return upright cleanly as Ritual arrives and bottle drifts back center
        .to(tiltGroup.rotation, { x: 0, y: 0, z: 0, duration: 0.6, ...beat }, 1.4)
        // 2.0 -> 3.0 screens (200vh -> 300vh): Held upright during Ritual steps, uncap, and mist spray
        // 3.0 -> 3.8 screens (300vh -> 380vh): Smoothly transition to showcase pose as cap shuts
        .to(tiltGroup.rotation, { x: 0.1, y: 0.35, z: 0.28, duration: 0.8, ...beat }, 3.0);
    },
    { dependencies: [ready], revertOnUpdate: true },
  );

  return (
    <div ref={hostRef} className={className ?? "h-full w-full"}>
      <Canvas
        className="h-full w-full"
        /* R3F forces `pointer-events: auto` on its own wrapper div (to catch canvas
           pointer events), which overrides the layer's `pointer-events-none` and
           would let this full-viewport canvas swallow every click meant for the
           Hero's arrows and buttons beneath it. The bottle is purely scroll-driven —
           it never needs DOM pointer events — so switch the wrapper back off. */
        style={{ pointerEvents: "none" }}
        /* See `frameloop` above: `always` only while the layer is on screen,
           `demand` once it has scrolled away, so an invisible WebGL surface
           stops competing with the page's own scroll for GPU time. */
        frameloop={frameloop}
        /* 1.5, not 2: the vessel is glass over parchment on a transparent canvas
           — a soft-edged, low-contrast subject, where the extra pixel doubling of
           dpr 2 (4× the fill) buys no visible fidelity but a real frame cost on
           integrated GPUs. Compact keeps the original 1.6 (its canvas is small). */
        dpr={[1, isCompact ? 1.6 : 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 7.2], fov: 24, near: 0.1, far: 40 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <StudioEnvironment />

        {/* Key light, front-right, gives the cap its broad highlight */}
        <directionalLight position={[2.6, 3.4, 4]} intensity={1.5} />
        {/* Fill, front-left */}
        <directionalLight position={[-3.2, 1.6, 2.4]} intensity={0.45} />
        {/* Rim, behind, lights the glass edges and the liquid from within */}
        <directionalLight position={[0, 1.2, -4]} intensity={1.1} />

        {/* The resting pose, set once as plain props — there is no longer a timeline
            writing this group, so React owns the transform outright and no ref is
            needed. Still a group rather than posing the model directly: it wraps the
            model's own suspense boundary, kept in here so the download cannot suspend
            the canvas itself, which would tear the WebGL context and the environment
            map down with it and rebuild both. */}
        <group position={[0, rest.y, 0]} scale={rest.scale}>
          {/* Tilt group for scroll-driven showcase pose and bottle tilt */}
          <group ref={refs.tiltGroup}>
            <Suspense fallback={null}>
              <BottleGltf refs={refs} liquidColor={juice} onReady={handleReady} />
            </Suspense>

            {/* The spray, a sibling of the model so it shares its framed space
                without being turned by the variant spin — and outside the suspense
                boundary, so its handles are wired from the first commit rather than
                when the download lands. */}
            <BottleMist refs={refs} color={juice} />
          </group>
        </group>
      </Canvas>
    </div>
  );
}
