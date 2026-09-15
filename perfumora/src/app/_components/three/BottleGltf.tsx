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
  /** The nozzle orifice node */
  nozzle: "nozzle",
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
 * Clean crystal glass edge shader:
 * Injects subtle specular Fresnel reflections along bevels, rims, and contours,
 * coupled with subtle optical refraction depth so the flacon reads as heavy,
 * weighted, authentic crystal glass with clear center transparency.
 */
function applyGlassEdge(
  material: MeshPhysicalMaterial,
  glintStrength: number = 0.45,
  alphaGlint: number = 0.35,
  edgeContourStrength: number = 0.12,
  cacheKey: string = "glass_edge_crystal_v8",
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
    float glint = pow(fresnel, 2.2) * ${glintStrength.toFixed(2)};
    gl_FragColor.rgb += vec3(glint);

    // 2. Optical refraction contour: subtle luxury glass edge definition
    vec3 glassEdgeTone = vec3(0.55, 0.52, 0.48);
    float contour = pow(fresnel, 4.0) * ${edgeContourStrength.toFixed(2)};
    gl_FragColor.rgb = mix(gl_FragColor.rgb, glassEdgeTone, contour);

    // 3. Physical Fresnel alpha: crystal-clear center, gentle edge definition
    gl_FragColor.a = clamp(gl_FragColor.a + fresnel * ${alphaGlint.toFixed(2)}, 0.0, 0.85);
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
    liquid.renderOrder = RENDER_ORDER.liquid;
    glass.renderOrder = RENDER_ORDER.glass;
    capGlass.renderOrder = RENDER_ORDER.glass;

    // Crystal-clear luxury glass transparency for both bottle and capOutside
    const configureGlassMaterial = (mat: MeshPhysicalMaterial, opacity: number = 0.08) => {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.transmission = 0;
      mat.opacity = opacity;
      mat.roughness = 0.02;
      mat.metalness = 0;
      mat.clearcoat = 0.85;
      mat.clearcoatRoughness = 0.01;
      mat.ior = 1.5;
      mat.reflectivity = 0.8;
      mat.color.set(0xffffff);
    };

    configureGlassMaterial(glass.material as MeshPhysicalMaterial, 0.08);
    configureGlassMaterial(capGlass.material as MeshPhysicalMaterial, 0.28);

    applyGlassEdge(glass.material as MeshPhysicalMaterial, 0.50, 0.40, 0.12, "glass_edge_bottle_v7");
    applyGlassEdge(capGlass.material as MeshPhysicalMaterial, 0.95, 0.60, 0.25, "glass_edge_cap_v8");

    // Translucent luxury perfume liquid matching the authentic 3D model
    const liquidMat = liquid.material as MeshPhysicalMaterial;
    liquidMat.transparent = true;
    liquidMat.depthWrite = false;
    liquidMat.transmission = 0;
    liquidMat.opacity = 0.3;
    liquidMat.roughness = 0.01;
    liquidMat.metalness = 0.0;
    liquidMat.clearcoat = 0.0;
    liquidMat.clearcoatRoughness = 0.0;
    liquidMat.ior = 1.333;
    liquidMat.reflectivity = 0.8;

    // Translucent white dip tube visible through the liquid
    const tubeMat = dipTube.material as MeshPhysicalMaterial;
    tubeMat.transparent = true;
    tubeMat.depthWrite = false;
    tubeMat.transmission = 0;
    tubeMat.opacity = 0.80;
    tubeMat.color.set(0xffffff);
    tubeMat.roughness = 0.05;
    tubeMat.clearcoat = 0.5;

    applyLiquidSloshShader(liquidMat, liquidUniformsRef.current);

    // Keep dynamic liquid color
    if (liquidColor) {
      liquidMat.color.set(liquidColor);
    }

    refs.glass.current = glass;
    refs.liquid.current = liquid;
    refs.liquidMaterial.current = liquidMat;
    refs.dipTube.current = dipTube;
    refs.cap.current = gltf.nodes[NODE.cap];
    refs.pumpButton.current = gltf.nodes[NODE.pumpButton];
    refs.nozzle.current = gltf.nodes[NODE.nozzle] ?? null;

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
