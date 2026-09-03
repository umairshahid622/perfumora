"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { NeutralToneMapping, Color, type Group } from "three";
import { readCssToken } from "../../_lib/css-token";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";
import { juiceColor } from "../../_lib/variants";
import { useMediaQuery } from "../../_hooks/useMediaQuery";
import { BottleGltf } from "./BottleGltf";
import { StudioEnvironment } from "./StudioEnvironment";
import { useBottleRefs } from "./useBottleRefs";
import { useBottleFloat } from "./useBottleFloat";
import {
  BOTTLE_WAYPOINTS,
  BOTTLE_WAYPOINTS_COMPACT,
  resolvePose,
  useBottleScroll,
} from "./useBottleScroll";

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
 * and *travels* between sections rather than being copied into each. Three motions
 * compose on nested groups, none of them authored inside the 3D components
 * themselves (§5): the scroll-driven travel on the outer *dock* group
 * (`useBottleScroll`), and on the inner assembly root the variant-change spin
 * (below) plus the idle float (`useBottleFloat`). The canvas is transparent so the
 * DOM layers show behind it (§4.1).
 */
export default function BottleScene({
  liquidColor,
  variantIndex,
  spinDirection,
  className,
}: BottleSceneProps) {
  const refs = useBottleRefs();
  // The outer group the scroll travel drives. Wraps the model's <Suspense>, so it
  // exists from first render even while the glTF is still downloading.
  const dockRef = useRef<Group>(null);
  // Flipped once the glTF resolves and `refs.root` is wired, so the idle float can
  // start against a root that exists — the model loads well after first render, and
  // that resolution doesn't re-run the hooks here on its own.
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  const isCompact = useMediaQuery("(max-width: 767px)");
  const accent = liquidColor ?? readCssToken("--accent", "#b87333");
  // The 3D liquid renders a treated variant colour: a pale juice's faint hue is
  // amplified so it reads as tinted clear liquid, not dead white; saturated juices
  // pass through unchanged (see `juiceColor`). Opacity is uniform across variants,
  // set on the material itself, so only the colour changes here.
  const juice = juiceColor(accent);
  const firstRun = useRef(true);
  // Portrait viewports get their own journey — no room for the sideways drift.
  const waypoints = isCompact ? BOTTLE_WAYPOINTS_COMPACT : BOTTLE_WAYPOINTS;
  // Where the bottle rests through the Hero — the first waypoint. Seeds the dock
  // group's transform so the model is already correct on the frame it first paints.
  const home = resolvePose(waypoints[0].pose);

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

  // Ambient idle drift (§6.3 #9), on the assembly root. Gated to the Manifesto →
  // Ritual span: through the Hero the bottle is dead still (it turns only on a
  // variant change), the float wakes as the Manifesto takes the screen, and it
  // sleeps again once the Ritual has scrolled past. Its bob (`position.y`) and roll
  // (`rotation.z`) never touch the axes the spin above and the dock travel below
  // drive, so all three layer cleanly.
  useBottleFloat(refs, {
    enabled: true,
    ready,
    trigger: `#${SECTION_IDS.manifesto}`,
    endTrigger: `#${SECTION_IDS.ritual}`,
  });

  // Scroll-driven section-to-section travel, on the outer dock group.
  useBottleScroll(dockRef, { ready, waypoints });

  return (
    <Canvas
      className={className}
      /* R3F forces `pointer-events: auto` on its own wrapper div (to catch canvas
         pointer events), which overrides the layer's `pointer-events-none` and
         would let this full-viewport canvas swallow every click meant for the
         Hero's arrows and buttons beneath it. The bottle is purely scroll-driven —
         it never needs DOM pointer events — so switch the wrapper back off. */
      style={{ pointerEvents: "none" }}
      /* `always`, not `demand`. Every motion here is authored in GSAP — the
         variant-change spin, the idle float and the scroll-driven travel all write
         the bottle's transform on GSAP's own ticker, which R3F has no way to know
         about. Without a frame every tick the canvas would render once and then sit
         still while the object moved underneath it. */
      frameloop="always"
      dpr={[1, isCompact ? 1.6 : 2]}
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

      {/* The dock group: the scroll travel's target, seeded with the Hero pose so
          the bottle starts in the right place. Wraps the model's own suspense
          boundary — kept in here so the download cannot suspend the canvas itself,
          which would tear the WebGL context and the environment map down with it
          and rebuild both. */}
      <group
        ref={dockRef}
        position={[home.x, home.y, 0]}
        scale={home.scale}
        rotation={[0, home.rotY, 0]}
      >
        <Suspense fallback={null}>
          <BottleGltf refs={refs} liquidColor={juice} onReady={handleReady} />
        </Suspense>
      </group>
    </Canvas>
  );
}
