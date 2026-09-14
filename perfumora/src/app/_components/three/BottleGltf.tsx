"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useLoader, useThree, type ThreeElements } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Mesh, MeshPhysicalMaterial, Vector3, type WebGLProgramParametersWithUniforms } from "three";
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

    return {
      scale,
      offset,
    };
  }, [gltf]);

  useLayoutEffect(() => {
    const glass = gltf.nodes[NODE.glass] as Mesh;
    const capGlass = gltf.nodes[NODE.capGlass] as Mesh;
    const liquid = gltf.nodes[NODE.liquid] as Mesh;
    const dipTube = gltf.nodes[NODE.dipTube] as Mesh;

    glass.visible = true;
    liquid.visible = true;

    dipTube.renderOrder = RENDER_ORDER.dipTube;
    glass.renderOrder = RENDER_ORDER.glass;
    capGlass.renderOrder = RENDER_ORDER.glass;

    // Retain native Blender materials for all meshes.
    // Injects slosh oscillation animation vertex displacement without touching material shading.
    applyLiquidSloshShader(liquid.material as MeshPhysicalMaterial, liquidUniformsRef.current);

    // Keep dynamic liquid color
    const liquidMat = liquid.material as MeshPhysicalMaterial;
    if (liquidColor) {
      liquidMat.color.set(liquidColor);
    }

    refs.glass.current = glass;
    refs.liquid.current = liquid;
    refs.liquidMaterial.current = liquidMat;
    refs.dipTube.current = dipTube;
    refs.cap.current = gltf.nodes[NODE.cap];
    refs.pumpButton.current = gltf.nodes[NODE.pumpButton];

    invalidate();
    // Last, so the motion hooks that react to this only ever see fully wired refs.
    onReady?.();
  }, [gltf, refs, invalidate, onReady, liquidColor]);

  return (
    <group ref={refs.root} {...groupProps}>
      {/* Bottle orientation matching Blender asset: -PI/2 brings the graceful dip-tube curve to the left */}
      <group scale={fit.scale} position={fit.offset} rotation-y={-Math.PI / 2}>
        <primitive object={gltf.scene} />
      </group>
    </group>
  );
}
