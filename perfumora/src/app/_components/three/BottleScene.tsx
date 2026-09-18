"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AgXToneMapping, Color } from "three";
import { readCssToken } from "../../_lib/css-token";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";
import { useMediaQuery } from "../../_hooks/useMediaQuery";
import { BottleGltf } from "./BottleGltf";
import { BottleMist } from "./BottleMist";
import { StudioEnvironment } from "./StudioEnvironment";
import { useBottleRefs } from "./useBottleRefs";
import { useBottleFloat } from "./useBottleFloat";
import { useBottleUncap } from "./useBottleUncap";
import { AddToBagBottleBridge } from "./AddToBagBottleBridge";

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
 * The yaw the bottle takes for the Ritual — a three-quarter turn toward the
 * viewer's right, held from just before the pump fires until the showcase.
 *
 * The plume's axis is the nozzle's own +Z, and at a dead-front pose that points
 * straight down the lens. Seen head-on, the cloud's whole forward travel
 * foreshortens to nothing and only its narrow lateral spread is left to look at,
 * which is why a correctly-tuned mist still read as a faint puff. Turning the
 * bottle opens the trajectory: the reach, the droop under gravity and the spread
 * of the cloud all become legible in profile instead of being compressed into a
 * circle. `+y` carries the face toward the viewer's right.
 */
const RITUAL_YAW = 0.55;

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
const REST = { y: 0.0, scale: 0.52 };
const REST_TABLET = { y: 0.0, scale: 0.48 };
const REST_COMPACT = { y: 0.0, scale: 0.42 };

export interface BottleSceneProps {
  /**
   * Liquid colour — the fragrance's own `hex`, untransformed, matching
   * `BottlePreview`. Left out, it falls back to the live `--accent` token.
   */
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
  const bottleRefs = useBottleRefs();
  const { tiltGroup: tiltGroupRef } = bottleRefs;
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
  // The fragrance's own colour, straight through. Callers pass the variant's
  // `hex`; the fallback is the live `--accent` token for the case where none was
  // given. Nothing is derived from it on the way in.
  const juice = liquidColor ?? readCssToken("--accent", "#b87333");
  const firstRun = useRef(true);
  const targetRotY = useRef(0);

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
      const root = bottleRefs.root.current;
      const material = bottleRefs.liquidMaterial.current;
      if (!root || !ready) return;

      if (firstRun.current) {
        firstRun.current = false;
        material?.color.set(juice);
        return;
      }

      if (prefersReducedMotion()) {
        material?.color.set(juice);
        return;
      }

      // Track target rotation so rapid clicks always land on an exact multiple of 2*PI (dead front).
      // Never add to mid-turn fractional angles which would displace the nozzle.
      targetRotY.current += spinDirection * SPIN_TURN;

      const tl = gsap.timeline({
        onComplete: () => {
          if (!root) return;
          // When spin settles, normalize to dead-front 0
          root.rotation.y = 0;
          targetRotY.current = 0;
        },
      });

      tl.to(
        root.rotation,
        {
          y: targetRotY.current,
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
    { dependencies: [variantIndex, ready] },
  );

  // Ambient idle drift (§6.3 #9), on the assembly root — wired, but off. It used to
  // be gated by a ScrollTrigger to the Manifesto → Ritual span, which meant it never
  // ran while the Hero was on screen; now that the Hero is the only beat the bottle
  // has, that gate would have been the last piece of scroll-driven motion left, and
  // switching the hook off keeps exactly the stillness the Hero always showed. Its
  // `enabled` flag is the hook's own opt-in, so this is a one-word change to revisit.
  useBottleFloat(bottleRefs, { enabled: false, ready });

  // The Ritual's theatre: the closure lifts off, the pump fires, the fragrance
  // hangs in the air (§4.3). Cued by the beat's own screen of the document — the
  // one screen `<OpeningStage>` holds still for reading — and played from there,
  // because a spray is an event and not a state to be scrubbed. The DOM half of
  // the same sequence, the three steps that arrive once the mist is up, is in
  // `<Ritual>`.
  useBottleUncap(bottleRefs, {
    enabled: true,
    ready,
    trigger: `#${SECTION_IDS.ritual}`,
  });

  // Master scrubbed tilt choreography across the opening stage:
  // 0.0 -> 1.0 screens: Leans into Manifesto pose (y: -0.14, z: -0.16)
  // 1.0 -> 2.0 screens: Holds lean while reading Manifesto
  // 2.0 -> 2.9 screens: Settles into the Ritual's three-quarter pose (y: RITUAL_YAW) as it arrives
  // 2.9 -> 4.5 screens: Holds that pose through the uncapping, the spray and the steps reveal
  // 4.5 -> 5.0 screens: Eases into the showcase angle (x: 0.1, y: 0.35, z: 0.28) as the cap shuts
  useGSAP(
    () => {
      const tiltGroup = bottleRefs.tiltGroup.current;
      const stageEl = document.querySelector<HTMLElement>("[data-opening-stage]");
      if (!ready || !tiltGroup || !stageEl || prefersReducedMotion()) return;

      gsap.set(tiltGroup.rotation, { x: 0, y: 0, z: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stageEl,
          start: "top top",
          end: () => `+=${window.innerHeight * 5}`,
          scrub: 0.5,
          fastScrollEnd: true,
          preventOverlaps: true,
        },
      });

      const beat = { ease: "power1.inOut" };

      tl
        // 0.0 -> 1.0 screens: Tilt into Manifesto lean as bottle drifts right
        .to(tiltGroup.rotation, { y: -0.14, z: -0.16, duration: 1.0, ...beat }, 0)
        // 1.0 -> 2.0 screens: Held tilted during Manifesto reading
        // 2.0 -> 2.9 screens: Turn to the three-quarter pose as the bottle drifts
        //   back to centre and the Ritual arrives. The pump fires at 3.0, so the
        //   yaw has to be settled before it does, and it eases in over 0.9s rather
        //   than snapping on the frame the spray starts.
        .to(tiltGroup.rotation, { x: 0, y: RITUAL_YAW, z: 0, duration: 0.9, ...beat }, 2.0)
        // 2.9 -> 4.5 screens: Held in the three-quarter pose through the Ritual's
        //   uncapping, spray and steps reveal — the plume reads in profile throughout.
        // 4.5 -> 5.0 screens: Ease into the showcase pose as the cap shuts. Its yaw
        //   is near RITUAL_YAW already, so this is mostly the x/z tilt.
        .to(tiltGroup.rotation, { x: 0.1, y: 0.5, z: 0.28, duration: 0.5, ...beat }, 4.5)
        .set({}, {}, 5.0);
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
          gl.toneMapping = AgXToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <StudioEnvironment intensity={0.80} />
        <AddToBagBottleBridge refs={bottleRefs} />

        {/* Studio ambient fill (balanced soft illumination) */}
        <ambientLight intensity={0.30} color="#ffffff" />

        {/* Studio_KeyLight (soft key light from upper right, gentle reflection) */}
        <directionalLight position={[3.2, 2.4, 4.2]} intensity={0.32} color="#fffaf2" />

        {/* Studio_FillLight (soft left fill) */}
        <directionalLight position={[-3.2, 1.4, 4.0]} intensity={0.22} color="#f4f8ff" />

        {/* Studio_RimLight (back-left rim light giving subtle crystal refraction edge) */}
        <directionalLight position={[-3.2, 2.4, -3.0]} intensity={0.28} color="#eef6ff" />

        {/* Studio_TopLight (overhead light defining cap bevels and shoulders) */}
        <directionalLight position={[0, 4.5, 1.0]} intensity={0.24} color="#ffffff" />

        {/* Studio_BottomBounce (gentle caustic glow on crystal base) */}
        <directionalLight position={[0, -2.2, 3.2]} intensity={0.22} color="#fff5ea" />

        {/* The resting pose, set once as plain props — there is no longer a timeline
            writing this group, so React owns the transform outright and no ref is
            needed. Still a group rather than posing the model directly: it wraps the
            model's own suspense boundary, kept in here so the download cannot suspend
            the canvas itself, which would tear the WebGL context and the environment
            map down with it and rebuild both. */}
        <group position={[0, rest.y, 0]} scale={rest.scale}>
          {/* Tilt group for scroll-driven showcase pose and bottle tilt */}
          <group ref={tiltGroupRef}>
            <Suspense fallback={null}>
              <BottleGltf refs={bottleRefs} liquidColor={juice} onReady={handleReady} />
            </Suspense>

            {/* The spray, a sibling of the model so it shares its framed space
                without being turned by the variant spin — and outside the suspense
                boundary, so its handles are wired from the first commit rather than
                when the download lands. */}
            <BottleMist refs={bottleRefs} color={juice} />
          </group>
        </group>
      </Canvas>
    </div>
  );
}
