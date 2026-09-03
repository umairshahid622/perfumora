"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useLoader, useThree, type ThreeElements } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Mesh, MeshPhysicalMaterial, Vector3 } from "three";
import type { BottleRefs } from "./useBottleRefs";

/** The supplied product model, served from `public/`. */
const MODEL_URL = "/perfume_bottle.glb";

/**
 * World-space height the model is normalised to, so the framing survives the
 * asset being re-exported at a different scale. 2.4 fills roughly three
 * quarters of the scene's 24° frame at the camera's distance.
 */
const FRAMED_HEIGHT = 2.4;

/**
 * The glTF node names this component reads — the contract with the asset. If an
 * export renames them, the wiring below silently finds nothing.
 */
const NODE = {
  glass: "bottle",
  /** The clear sleeve around the cap — a child of `cap`, whose own material is
   *  the opaque dark one. Both ship as glass from Blender. */
  capGlass: "capOutside",
  liquid: "liquid",
  dipTube: "pipe",
  cap: "cap",
} as const;

/**
 * Draw order inside three's transparent pass, which sorts on `renderOrder`
 * before depth: the fragrance has to be laid down before the glass that blends
 * over it, or the glass covers it instead. The dip tube's entry is inert — it is
 * opaque, so it draws in the opaque pass ahead of both of them regardless — but
 * it documents where in the stack it belongs.
 */
const RENDER_ORDER = { liquid: 0, dipTube: 1, glass: 2 } as const;

/**
 * Nothing in this scene refracts — every see-through surface is plain alpha
 * blending — and that is a requirement, not a simplification. The canvas is
 * transparent and the oversized fragrance name is a DOM layer *behind* it
 * (§4.1), so the only mechanism that can show the name through the bottle is
 * blending against the page. Refraction cannot: three and drei both resolve
 * transmission by sampling an off-screen render of the scene, and the DOM is not
 * in the scene. That is exactly why the dip tube showed through a transmissive
 * fragrance while the name behind the bottle did not.
 *
 * It also happens to suit the geometry. Both glass shells — the bottle wall and
 * the sleeve around the cap — are single lathe surfaces with no volume to refract
 * through, so their `thickness` could only ever be faked from a bounding box; a
 * thin reflective shell is what they actually are. Their glassiness comes from
 * clearcoat, the studio environment reflecting in them, and the Fresnel rim
 * `applyGlassEdge` puts back (see below).
 *
 * With `transmission: 0` everywhere, three's transmissive bucket is empty and it
 * skips that pass altogether.
 */
const GLASS_MATERIAL = {
  transmission: 0,
  transparent: true,
  opacity: 0.16,
  roughness: 0.04,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.6,
  depthWrite: false,
} as const;

/**
 * Clear glass reads on a light page through its *edges*, not its body: the
 * silhouette catches a Fresnel rim at grazing angles while the surface facing the
 * camera stays nearly clear. Transmission gave us that rim for free, but
 * transmission samples a scene-only buffer that cannot see the DOM watermark
 * behind the canvas (see `GLASS_MATERIAL`), so dropping it took the rim with it
 * and left the shell at a flat 16% — near-invisible on parchment.
 *
 * This restores only the rim, by hand. `power` sets how tight it is, `alpha` how
 * opaque it gets on top of the resting `opacity`, and `tint`/colour how far it
 * darkens toward a soft contour — the darkening is what guarantees the edge
 * contrasts with the page rather than the near-white environment it reflects.
 * These are the knobs to turn if the edge reads too heavy or too faint.
 */
const GLASS_EDGE = { power: 2, alpha: 0.25, tint: 0.25 } as const;

/** The contour the rim darkens toward, as sRGB channels — warm, to sit with the
 *  parchment. Read in output space: the patch runs after tone-mapping and the
 *  colour-space conversion, so this is a plain sRGB value, not linear. */
const GLASS_EDGE_COLOR = "0.16, 0.14, 0.12";

/**
 * The cap sleeve's Fresnel rim tints toward this warm cast instead of the wall's
 * neutral `GLASS_EDGE_COLOR`, so `capOutside` reads as smoked glass on its
 * *silhouette only* while its body stays as clear as the bottle wall. Same
 * output-space sRGB channels as `GLASS_EDGE_COLOR` (the patch runs after
 * tone-mapping); ≈ #5b4f45. Turned by eye — if the rim reads too faint, raise
 * `GLASS_EDGE.tint`/`.alpha`, though those lift the wall's rim with it.
 */
const CAP_EDGE_COLOR = "0.36, 0.31, 0.27";

/**
 * The fragrance's own Fresnel rim tints toward this neutral-cool contour. Every
 * juice renders at one translucent opacity (`LIQUID_OPACITY`) so it reads as clear
 * liquid rather than thick paint — but a translucent body has no visible edge, so
 * on its own it reads as an *empty* bottle. This rim draws
 * the fragrance's silhouette and meniscus — the same edge-lit trick that makes the
 * clear glass legible — so the juice reads as a liquid volume catching light. Kept
 * neutral rather than warm/cool so it defines the edge of the golds and the
 * near-clears alike. Output-space sRGB channels like the two above; ≈ #6b7079.
 */
const LIQUID_EDGE_COLOR = "0.42, 0.44, 0.48";

/**
 * Every juice renders at this one opacity — the material is otherwise identical
 * across variants (same rim, roughness, gloss, IOR), so hue is all that changes
 * from one fragrance to the next. Translucent enough that a saturated juice reads
 * as liquid rather than thick dark paint, opaque enough that a pale one keeps a
 * visible body: the single knob for how full / how heavy the fragrance looks.
 */
const LIQUID_OPACITY = 0.5;

/**
 * Injects the rim above into a material's compiled fragment shader. It hooks the
 * final chunk — by then `gl_FragColor` is fully lit, tone-mapped and in output
 * space — and rewrites its alpha and colour from a Fresnel term. `abs()` on the
 * view·normal dot so both faces of the double-sided bottle wall rim their own
 * silhouette. `vViewPosition` and `vNormal` are both declared by
 * `MeshPhysicalMaterial`'s own shader, and `#include <dithering_fragment>` is
 * always present (a no-op macro when dithering is off), so the replace always
 * lands. Kept out of `GLASS_MATERIAL` because it is a function on the instance,
 * not a copyable property — the two glass shells and the fragrance each need it
 * assigned. `edgeColor` is
 * a parameter so the cap sleeve can rim toward a warm tint (`CAP_EDGE_COLOR`)
 * while the wall keeps the neutral contour.
 */
function applyGlassEdge(
  material: MeshPhysicalMaterial,
  edgeColor: string = GLASS_EDGE_COLOR,
): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), ${GLASS_EDGE.power.toFixed(1)});
    gl_FragColor.a = clamp(gl_FragColor.a + edge * ${GLASS_EDGE.alpha.toFixed(2)}, 0.0, 1.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${edgeColor}), edge * ${GLASS_EDGE.tint.toFixed(2)});
  }`,
    );
  };
  material.needsUpdate = true;
}

/**
 * The glTF models the fragrance narrower than the glass around it: both are
 * unit-radius lathes carrying their own scale — 1.0671 for the fragrance against
 * 1.2030 for the glass — so 11.3% of the bottle's radius reads as an air gap.
 * The fragrance is widened to this fraction of the way out to the glass wall,
 * leaving 1% of clearance so the two surfaces don't shimmer against each other.
 */
const LIQUID_WALL_CLEARANCE = 0.99;

/** Largest distance from a lathe mesh's own Y axis, in its local space. */
function localRadius(mesh: Mesh): number {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  return Math.max(box.max.x, box.max.z, -box.min.x, -box.min.z);
}

interface BottleGltfProps extends Omit<ThreeElements["group"], "ref"> {
  refs: BottleRefs;
  /**
   * The fragrance's *starting* colour. Only the value present when this mounts
   * is ever applied here: from then on `refs.liquidMaterial` is GSAP's to tween,
   * and re-applying the prop declaratively would snap the colour to each new
   * variant before the change timeline had a chance to cross-fade it (§6.3 #10).
   */
  liquidColor: string;
  /**
   * Fired once the refs below are wired. The glTF resolves long after first
   * render, inside a `<Suspense>`, and that resolution does not re-run the
   * caller's motion hooks on its own — this is how they learn there is finally a
   * `refs.root` to animate.
   */
  onReady?: () => void;
}

/**
 * The product itself, loaded from the supplied glTF rather than modelled in
 * code, so the silhouette is exactly the one that was authored (§0: the model
 * must match the real product, with no invented details).
 *
 * Everything here is either wiring — the refs the GSAP layer will tween — or a
 * material the glTF cannot supply: the fragrance's, which the file has none of at
 * all, and the two glass shells', which ship transmissive and have to be stepped
 * down. No animation lives here (§5).
 */
export function BottleGltf({
  refs,
  liquidColor,
  onReady,
  ...groupProps
}: BottleGltfProps) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const invalidate = useThree((state) => state.invalidate);
  // Frozen at mount on purpose — see `liquidColor` above. A suspended first
  // render never commits, so this captures whichever variant is live when the
  // glTF actually resolves.
  const [initialLiquidColor] = useState(liquidColor);

  /**
   * Uniform scale to `FRAMED_HEIGHT`, plus the offset that puts the model's
   * bounding-box centre on the origin so a spin turns about the product's own
   * axis. Measured during render, while the loaded scene is still unparented —
   * once it is mounted inside the scaled group below, `Box3.setFromObject`
   * would report the already-scaled size.
   */
  const fit = useMemo(() => {
    const bounds = new Box3().setFromObject(gltf.scene);
    const scale = FRAMED_HEIGHT / bounds.getSize(new Vector3()).y;
    const offset = bounds.getCenter(new Vector3()).multiplyScalar(-scale);

    const glass = gltf.nodes[NODE.glass] as Mesh;
    const liquid = gltf.nodes[NODE.liquid] as Mesh;

    // Derived from the two meshes' *geometry*, not by nudging the fragrance's
    // current scale, so assigning it is idempotent: this runs again under
    // React's dev-time double invoke, and a relative nudge would compound into
    // the fragrance poking through the glass.
    const liquidRadialScale =
      (localRadius(glass) * glass.scale.x * LIQUID_WALL_CLEARANCE) /
      localRadius(liquid);

    return {
      scale,
      offset,
      liquidRadialScale,
    };
  }, [gltf]);

  useLayoutEffect(() => {
    const glass = gltf.nodes[NODE.glass] as Mesh;
    const capGlass = gltf.nodes[NODE.capGlass] as Mesh;
    const liquid = gltf.nodes[NODE.liquid] as Mesh;
    const dipTube = gltf.nodes[NODE.dipTube] as Mesh;

    dipTube.renderOrder = RENDER_ORDER.dipTube;
    glass.renderOrder = RENDER_ORDER.glass;
    capGlass.renderOrder = RENDER_ORDER.glass;

    // Demote both glass shells and the dip tube out of the transmissive bucket.
    // All three ship from the glTF at `transmission: 1`, which would leave the
    // shells unable to show the page behind them and the straw invisible inside
    // the bottle. The two shells carry separate glTF materials, so they are
    // separate instances here and each needs assigning. They are also the file's
    // only three transmissive materials — everything else in it ships opaque, and
    // the fragrance ships with no material at all — so once these are stepped
    // down nothing in the scene refracts.
    Object.assign(glass.material as MeshPhysicalMaterial, GLASS_MATERIAL);
    Object.assign(capGlass.material as MeshPhysicalMaterial, GLASS_MATERIAL);
    // The Fresnel rim that makes clear glass legible on the light page — assigned
    // per instance because it is a shader hook, not a copyable material property.
    // The cap sleeve rims toward a warm tint instead of the wall's neutral
    // contour, so the smoked cast lands on its silhouette only and the body of
    // the shell stays as clear as the wall.
    applyGlassEdge(glass.material as MeshPhysicalMaterial);
    applyGlassEdge(capGlass.material as MeshPhysicalMaterial, CAP_EDGE_COLOR);
    // The fragrance takes the same rim (see `LIQUID_EDGE_COLOR`): a translucent
    // pale juice has no visible body edge on its own, so this draws its silhouette
    // and meniscus and the thinned liquid reads as a lit volume, not an empty
    // bottle. Rides over the colour/opacity the change timeline tweens — it only
    // rewrites `gl_FragColor` at grazing angles, leaving the body those drive.
    applyGlassEdge(liquid.material as MeshPhysicalMaterial, LIQUID_EDGE_COLOR);
    const tube = dipTube.material as MeshPhysicalMaterial;
    tube.transmission = 0;
    tube.transparent = false;

    refs.glass.current = glass;
    refs.liquid.current = liquid;
    // Attached by the reconciler as a child of the <primitive> below, which the
    // commit phase completes before this effect runs.
    refs.liquidMaterial.current = liquid.material as MeshPhysicalMaterial;
    refs.dipTube.current = dipTube;
    refs.cap.current = gltf.nodes[NODE.cap];

    invalidate();
    // Last, so the motion hooks that react to this only ever see fully wired refs.
    onReady?.();
  }, [gltf, refs, invalidate, onReady]);

  return (
    <group ref={refs.root} {...groupProps}>
      <group scale={fit.scale} position={fit.offset}>
        <primitive object={gltf.scene} />

        {/* The fragrance is lifted out of the glTF's own scene graph so its
            material can be attached here as a JSX child — the file ships it with
            none. That is safe because the glTF root is exactly identity — so the
            reparenting leaves the world transform untouched — and the fragrance is
            strictly interior to the bottle, so it never contributed to the bounds
            the framing above is measured from.

            The radial fit is applied declaratively rather than by mutating
            `liquid.scale`, which makes it idempotent: React's dev-time double
            invoke re-applies the same absolute value instead of compounding it. */}
        <primitive
          object={gltf.nodes[NODE.liquid]}
          scale-x={fit.liquidRadialScale}
          scale-z={fit.liquidRadialScale}
          renderOrder={RENDER_ORDER.liquid}
        >
          {/* Alpha-blended, not transmissive — see `GLASS_MATERIAL`. A refracting
              fragrance samples an off-screen render of the scene, and the
              oversized name behind the bottle is a DOM layer, not scene geometry,
              so refraction could never pick it up; blending against the
              transparent canvas can. What that costs is real lensing — no
              chromatic aberration, no inverted letters through the middle.

              Left front-faced (the default): one layer of `LIQUID_OPACITY` rather
              than two, and a double-sided fragrance would blend its own back wall
              in arbitrary order, since three sorts meshes but not the triangles
              within one. `ior` still earns its place at `transmission: 0` — three
              derives a dielectric's specular reflectance from it, so this reflects
              like a liquid instead of like the 1.5 glass around it. */}
          <meshPhysicalMaterial
            color={initialLiquidColor}
            transparent
            opacity={LIQUID_OPACITY}
            ior={1.36}
            roughness={0.05}
            clearcoat={0.3}
            clearcoatRoughness={0.05}
            envMapIntensity={1.5}
            depthWrite={false}
          />
        </primitive>
      </group>
    </group>
  );
}
