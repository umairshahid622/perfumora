"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLoader, useThree, type ThreeElements } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Color, Mesh, MeshPhysicalMaterial, Vector3, type WebGLProgramParametersWithUniforms } from "three";
import type { BottleRefs } from "./useBottleRefs";
import {
  useLiquidPhysics,
  createLiquidUniforms,
  type LiquidUniforms,
} from "./useLiquidPhysics";

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
  /** The pump's press button, which the closure above hides until it lifts. */
  pumpButton: "automizerButton",
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
  opacity: 0.06,
  roughness: 0.0,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.005,
  envMapIntensity: 3.5,
  ior: 1.52,
  depthWrite: false,
} as const;

/**
 * Dedicated high-definition glass material for the transparent cap outer piece / sleeve (`capOutside`).
 * Gives the cap's crystal outer sleeve pristine clarity, crisp specular presence, and luminous highlights.
 */
const CAP_GLASS_MATERIAL = {
  transmission: 0,
  transparent: true,
  opacity: 0.22,
  roughness: 0.0,
  metalness: 0.01,
  clearcoat: 1,
  clearcoatRoughness: 0.005,
  envMapIntensity: 3.6,
  ior: 1.54,
  depthWrite: false,
} as const;

/**
 * Clean crystal glass edge shader:
 * Injects bright specular Fresnel reflections along bevels, rims, and contours,
 * coupled with subtle optical refraction depth so the flacon reads as heavy,
 * weighted, authentic crystal glass rather than a flat transparent sheet.
 */
function applyGlassEdge(
  material: MeshPhysicalMaterial,
  glintStrength: number = 0.85,
  alphaGlint: number = 0.70,
  edgeContourStrength: number = 0.20,
  cacheKey: string = "glass_edge_crystal_v5",
): void {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float fresnel = pow(1.0 - cosTheta, 2.5);

    // 1. Crystalline specular glint catching studio softbox lighting along bevels and vertical sides
    float glint = pow(fresnel, 1.8) * ${glintStrength.toFixed(2)};
    gl_FragColor.rgb += vec3(glint);

    // 2. Optical refraction contour: subtle luxury glass edge definition (NOT black paint)
    // Delicate neutral glass tone that gives physical weight to bevels and flacon perimeter
    vec3 glassEdgeTone = vec3(0.34, 0.31, 0.28);
    float contour = pow(fresnel, 4.0) * ${edgeContourStrength.toFixed(2)};
    gl_FragColor.rgb = mix(gl_FragColor.rgb, glassEdgeTone, contour);

    // 3. Physical Fresnel alpha: crystal-clear center (base opacity 0.06), solid specular reflection at edges
    gl_FragColor.a = clamp(gl_FragColor.a + fresnel * ${alphaGlint.toFixed(2)}, 0.0, 0.90);
  }`,
    );
  };
  material.needsUpdate = true;
}

/**
 * Injects slosh displacement and surface micro-waves into the liquid mesh vertex shader,
 * while providing authentic liquid translucency, Beer-Lambert depth darkening at silhouettes,
 * and delicate surface specular highlights without muddy gray tints.
 */
function applyLiquidSloshShader(
  material: MeshPhysicalMaterial,
  uniforms: LiquidUniforms,
): void {
  material.customProgramCacheKey = () => "liquid_slosh_shader_v26";
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // Bind uniforms to shader
    shader.uniforms.uSlosh = uniforms.uSlosh;
    shader.uniforms.uWaveTime = uniforms.uWaveTime;
    shader.uniforms.uWaveIntensity = uniforms.uWaveIntensity;

    // 1. Declare uniforms in vertex shader
    shader.vertexShader =
      `uniform vec2 uSlosh;\nuniform float uWaveTime;\nuniform float uWaveIntensity;\n` +
      shader.vertexShader;

    // 2. Displace vertices in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
  {
    // Adjusted fill level: keeping bottom bowl (y <= -0.45) anchored while setting a balanced fill level
    if (position.y > -0.45) {
      float fillT = (position.y - (-0.45)) / 1.45;
      transformed.y += fillT * 0.22;
    }

    // Slosh counter-tilt displacement: 0 at curved bottom bowl, transitions to full at upper meniscus
    float hFactor = smoothstep(-0.2, 1.15, transformed.y);
    float sloshTilt = clamp((position.x * uSlosh.x + position.z * uSlosh.y) * hFactor, -0.22, 0.22);

    // Silky-smooth counter-tilt fluid motion without high-frequency vertex shivering or vibration
    transformed.y += sloshTilt;
  }`,
    );

    // 3. Normal adjustment for accurate specular reflections on sloshing liquid
    shader.vertexShader = shader.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `#include <defaultnormal_vertex>
  {
    float normFactor = smoothstep(0.4, 0.9, position.y);
    transformedNormal = normalize(vec3(
      transformedNormal.x - uSlosh.x * 0.5 * normFactor,
      transformedNormal.y,
      transformedNormal.z - uSlosh.y * 0.5 * normFactor
    ));
  }`,
    );

    // 4. Fragment shader: Luminous Fresnel rim & dielectric specular highlights
    // Radiant pure liquid tone without muddy gray edge tints
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float fresnel = pow(1.0 - cosTheta, 2.5);

    // Liquid surface specular glint catching studio environment light
    float glint = pow(fresnel, 3.2) * 0.45;
    gl_FragColor.rgb += vec3(glint);

    // Natural fragrance translucency with subtle edge optical depth
    gl_FragColor.a = clamp(gl_FragColor.a + fresnel * 0.18, 0.0, 0.70);
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
const LIQUID_WALL_CLEARANCE = 0.94;

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
  const liquidUniformsRef = useRef<LiquidUniforms>(createLiquidUniforms());

  // Real-time liquid slosh physics simulation loop
  useLiquidPhysics(refs, liquidUniformsRef);

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

    liquid.visible = true;

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
    Object.assign(capGlass.material as MeshPhysicalMaterial, CAP_GLASS_MATERIAL);

    // Enforce pure white base color to eliminate any grey/dark import factor from glTF
    (glass.material as MeshPhysicalMaterial).color = new Color(0xffffff);
    (capGlass.material as MeshPhysicalMaterial).color = new Color(0xffffff);

    // Apply clean crystalline specular edge highlights catching studio softbox light
    applyGlassEdge(glass.material as MeshPhysicalMaterial, 0.85, 0.70, 0.20, "glass_edge_bottle_v5");
    applyGlassEdge(capGlass.material as MeshPhysicalMaterial, 0.95, 0.65, 0.25, "glass_edge_cap_v5");
    applyLiquidSloshShader(liquid.material as MeshPhysicalMaterial, liquidUniformsRef.current);

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
    refs.pumpButton.current = gltf.nodes[NODE.pumpButton];

    invalidate();
    // Last, so the motion hooks that react to this only ever see fully wired refs.
    onReady?.();
  }, [gltf, refs, invalidate, onReady]);

  return (
    <group ref={refs.root} {...groupProps}>
      <group scale={fit.scale} position={fit.offset}>
        <primitive object={gltf.scene} />

        {/* The fragrance is lifted out of the glTF's own scene graph so its
            material can be attached here as a JSX child with its authentic curved
            bottom bowl and meniscus.
            The radial fit is applied declaratively rather than by mutating
            `liquid.scale`. */}
        <primitive
          object={gltf.nodes[NODE.liquid]}
          scale-x={fit.liquidRadialScale}
          scale-z={fit.liquidRadialScale}
          renderOrder={RENDER_ORDER.liquid}
        >
          <meshPhysicalMaterial
            color={initialLiquidColor}
            transparent
            opacity={0.50}
            ior={1.34}
            roughness={0.0}
            metalness={0.0}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
            envMapIntensity={2.0}
            depthWrite={false}
          />
        </primitive>
      </group>
    </group>
  );
}
