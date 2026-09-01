"use client";

import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { NeutralToneMapping, Color } from "three";
import { cn } from "../../_lib/cn";
import { readCssToken } from "../../_lib/css-token";
import { prefersReducedMotion } from "../../_lib/motion";
import { juiceColor } from "../../_lib/variants";
import { useMediaQuery } from "../../_hooks/useMediaQuery";
import { BottleGltf } from "./BottleGltf";
import { StudioEnvironment } from "./StudioEnvironment";
import { useBottleRefs } from "./useBottleRefs";

/**
 * How far the camera may tilt off the equator, in radians (~17°). Enough to look
 * a little down into the bottle or up at the cap, but not enough to tip under the
 * base — there is no floor in the scene, so a low angle would give away that the
 * model is floating.
 */
const POLAR_RANGE = 0.3;

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
 * The canvas is transparent so DOM layers can sit behind the model (§4.1). It
 * also owns the fragrance-change spin, because that tween's target is the
 * assembly root the bottle refs expose (§6.3 #10).
 */
export default function BottleScene({
  liquidColor,
  variantIndex,
  spinDirection,
  className,
}: BottleSceneProps) {
  const refs = useBottleRefs();
  const isCompact = useMediaQuery("(max-width: 767px)");
  const accent = liquidColor ?? readCssToken("--accent", "#b87333");
  // The 3D liquid renders a treated variant colour: a pale juice's faint hue is
  // amplified so it reads as tinted clear liquid, not dead white; saturated juices
  // pass through unchanged (see `juiceColor`). Opacity is uniform across variants,
  // set on the material itself, so only the colour changes here.
  const juice = juiceColor(accent);
  const firstRun = useRef(true);

  /**
   * The change timeline (§6.3 #10): the bottle turns the way the arrow pointed
   * and the fragrance cross-fades to the new colour mid-turn. Positive
   * `rotation.y` carries the face toward +X, which is the viewer's right, so the
   * sign of `spinDirection` maps straight onto "which arrow was pressed".
   *
   * The camera is left alone deliberately — spinning the model rather than the
   * orbit rig means this never fights OrbitControls, and a drag mid-spin still
   * works.
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

      // Each leg overwrites any tween still running on the same target, so a
      // press mid-change redirects the bottle and the colour from wherever they
      // have got to. Presses always arrive in order, so the newest leg is always
      // the last to initialise and therefore the one that wins.
      const tl = gsap.timeline();

      tl.to(
        root.rotation,
        {
          y: root.rotation.y + spinDirection * SPIN_TURN,
          duration: SPIN_DURATION,
          ease: "power2.inOut",
          overwrite: true,
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

  return (
    <Canvas
      /* `touch-pan-y!` hands vertical swipes back to the browser. OrbitControls
         connects to R3F's outer wrapper div — the same element this className
         lands on — and its `connect()` sets `touch-action: none` there
         unconditionally, not gated on `enableRotate` or `touches`. That would
         trap one-finger page scrolling inside the bottle stage, which is most of
         the hero on a phone. The `!` is load-bearing: `connect()` writes an
         inline style, and only an `!important` rule outranks one. Vertical drags
         now scroll the page and horizontal drags turn the bottle, which is the
         axis worth dragging anyway. */
      className={cn(className, "touch-pan-y!")}
      /* `always`, not `demand`. Two things here need a frame every tick and
         neither can ask for one.

         `autoRotate` folds its step into the same `sphericalDelta` that damping
         decays, and OrbitControls only emits the `change` event drei turns into
         `invalidate()` when the camera actually moved more than EPS (1e-6). Drag
         *against* the auto-rotation and the decaying drag momentum cancels the
         auto-rotation step exactly — one frame under EPS, no `change`, no
         `invalidate()`, nothing scheduled, and the rotation is dead for good.
         Dragging *with* it never cancels, which is why it only stalled one way.

         The spin above has the same problem from the other end: GSAP writes
         `rotation.y` on its own ticker and R3F has no idea it happened. */
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

      {/* Drag to inspect the product. Zoom and pan are both off: zoom would
          fight the page's own scrolling and undo the framing <BottleGltf>
          computes, and panning would slide the bottle off the oversized variant
          name it is centred on. Damping is drei's default, and each damped step
          fires `change` → `invalidate()`, so the glide settles even though the
          canvas only renders on demand. */}
      <OrbitControls
        enableZoom={false}
        autoRotate = {true}
        autoRotateSpeed={7}
        enablePan={false}
        minPolarAngle={Math.PI / 2 - POLAR_RANGE}
        maxPolarAngle={Math.PI / 2 + POLAR_RANGE}
      />

      {/* Key light, front-right, gives the cap its broad highlight */}
      <directionalLight position={[2.6, 3.4, 4]} intensity={1.5} />
      {/* Fill, front-left */}
      <directionalLight position={[-3.2, 1.6, 2.4]} intensity={0.45} />
      {/* Rim, behind, lights the glass edges and the liquid from within */}
      <directionalLight position={[0, 1.2, -4]} intensity={1.1} />

      {/* Keeping the model's own suspense boundary in here means the download
          cannot suspend the canvas itself — which would tear the WebGL context
          and the environment map down with it and rebuild both. */}
      <Suspense fallback={null}>
        <BottleGltf refs={refs} liquidColor={juice} />
      </Suspense>
    </Canvas>
  );
}
