"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useLoader, useThree, type ThreeElements } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Color, FrontSide, Mesh, MeshPhysicalMaterial, Vector3, type WebGLProgramParametersWithUniforms } from "three";
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
 * over it, or the glass covers it instead.
 */
const RENDER_ORDER = { dipTube: 0, liquid: 1, glass: 2 } as const;

/**
 * Injects slosh oscillation displacement into the liquid mesh vertex shader,
 * keeping the original Blender material shading completely untouched.
 */
function applyLiquidSloshShader(
  material: MeshPhysicalMaterial,
  uniforms: LiquidUniforms,
): void {
  material.customProgramCacheKey = () => "liquid_slosh_shader_v28";
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // Bind uniforms to shader
    shader.uniforms.uSlosh = uniforms.uSlosh;
    shader.uniforms.uWaveTime = uniforms.uWaveTime;
    shader.uniforms.uWaveIntensity = uniforms.uWaveIntensity;

    // 1. Declare uniforms in vertex shader
    shader.vertexShader =
      `uniform vec2 uSlosh;\nuniform float uWaveTime;\nuniform float uWaveIntensity;\n` +
      shader.vertexShader;

    // 2. Displace vertices in vertex shader for slosh counter-tilt oscillation
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
  {
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
   * The fragrance's starting colour (optional fallback).
   */
  liquidColor?: string;
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
 * code, so the silhouette and authored materials are exactly the ones set in Blender.
 */
export function BottleGltf({
  refs,
  liquidColor,
  onReady,
  ...groupProps
}: BottleGltfProps) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const invalidate = useThree((state) => state.invalidate);
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

    // Retain authored Blender materials for bottle, capOutside, and liquid.
    // Injects slosh oscillation animation vertex displacement without touching material shading.
    applyLiquidSloshShader(liquid.material as MeshPhysicalMaterial, liquidUniformsRef.current);

    // Dip tube: crisp translucent white plastic visible through tinted liquid
    const tube = dipTube.material as MeshPhysicalMaterial;
    tube.color.set("#ffffff");
    tube.roughness = 0.05;
    tube.clearcoat = 1.0;
    tube.clearcoatRoughness = 0.02;
    tube.transmission = 0;
    tube.transparent = false;

    // Liquid: transparent, shiny fluid with defined meniscus, refractive IOR and wet clearcoat gloss
    const liquidMat = liquid.material as MeshPhysicalMaterial;
    liquidMat.side = FrontSide;
    liquidMat.depthWrite = false;
    liquidMat.transparent = true;
    liquidMat.opacity = 0.60;
    liquidMat.transmission = 0;
    liquidMat.roughness = 0.01;
    liquidMat.metalness = 0.0;
    liquidMat.clearcoat = 1.0;
    liquidMat.clearcoatRoughness = 0.01;
    liquidMat.ior = 1.333;
    liquidMat.reflectivity = 1.0;

    // Physical crystal glass parameters with high clarity, thickness and softbox specular highlights
    const glassMat = glass.material as MeshPhysicalMaterial;
    glassMat.side = FrontSide;
    glassMat.depthWrite = false;
    glassMat.transmission = 0.40;
    glassMat.transparent = true;
    glassMat.opacity = 0.70;
    glassMat.thickness = 0.35;
    glassMat.attenuationDistance = 2.0;
    glassMat.attenuationColor = new Color(0x1a1a20);
    glassMat.roughness = 0.01;
    glassMat.clearcoat = 1.0;
    glassMat.clearcoatRoughness = 0.01;
    glassMat.ior = 1.5;
    glassMat.reflectivity = 1.0;

    const capGlassMat = capGlass.material as MeshPhysicalMaterial;
    capGlassMat.side = FrontSide;
    capGlassMat.depthWrite = false;
    capGlassMat.transmission = 0.40;
    capGlassMat.transparent = true;
    capGlassMat.opacity = 0.70;
    capGlassMat.thickness = 0.30;
    capGlassMat.attenuationDistance = 2.0;
    capGlassMat.attenuationColor = new Color(0x1a1a20);
    capGlassMat.roughness = 0.01;
    capGlassMat.clearcoat = 1.0;
    capGlassMat.clearcoatRoughness = 0.01;
    capGlassMat.ior = 1.5;
    capGlassMat.reflectivity = 1.0;

    refs.glass.current = glass;
    refs.liquid.current = liquid;
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

        {/* Liquid mesh with slosh oscillation animation and native Blender material */}
        <primitive
          object={gltf.nodes[NODE.liquid]}
          scale-x={fit.liquidRadialScale}
          scale-z={fit.liquidRadialScale}
          renderOrder={RENDER_ORDER.liquid}
        />
      </group>
    </group>
  );
}
