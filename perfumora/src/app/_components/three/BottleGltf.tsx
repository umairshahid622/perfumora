"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLoader, useThree, type ThreeElements } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  Color,
  FrontSide,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { BottleRefs } from "./useBottleRefs";
import {
  useLiquidPhysics,
  createLiquidUniforms,
  type LiquidUniforms,
} from "./useLiquidPhysics";
import { OilBubbles } from "./OilBubbles";

/** The supplied product model, served from `public/`. */
const MODEL_URL = "/perfume_bottle.glb";

/**
 * World-space height the model is normalised to, so the framing survives the
 * asset being re-exported at a different scale.
 */
const FRAMED_HEIGHT = 2.4;

/**
 * The glTF node names this component reads — the contract with the asset.
 */
const NODE = {
  glass: "bottle",
  capGlass: "capOutside",
  liquid: "liquid",
  dipTube: "pipe",
  cap: "cap",
  pumpButton: "automizerButton",
  nozzle: "nozzle",
} as const;

/**
 * Draw order inside three's transparent pass:
 * dipTube (0) -> liquid (1) -> glass flacon (2)
 */
const RENDER_ORDER = { dipTube: 0, liquid: 1, glass: 2, rest: 3 } as const;

/**
 * The nozzle's horizontal offset from the pump button it hangs off.
 */
const NOZZLE_OFFSET = { x: 0.151, z: -1.134 } as const;

/**
 * Yaw that puts the pump's spout straight at the camera.
 */
const NOZZLE_YAW = Math.PI + Math.atan2(NOZZLE_OFFSET.x, -NOZZLE_OFFSET.z);

/**
 * Crystal-clear luxury glass flacon shader:
 * - Subtle studio softbox reflections on curved flanks
 * - Dark inner shade band defining the glass wall thickness
 * - Solid crystal base ("culot") internal refraction at Y in [-1.741, -1.226]
 * - Grazing chromatic split at silhouette
 */
function applyGlassShader(
  material: MeshPhysicalMaterial,
  innerShade: number = 0.45,
  cacheKey: string = "glass_edge_crystal_v21",
): void {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader =
      `varying vec3 vModelPos;\n` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvModelPos = position;`,
      );

    shader.fragmentShader =
      `varying vec3 vModelPos;\n` +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float grazing = 1.0 - cosTheta;

    // Normalised key light direction [3.2, 2.4, 4.2]
    vec3 keyDir = vec3(0.5517, 0.4138, 0.7241);
    float lit = smoothstep(-0.35, 0.85, dot(normalize(vNormal), keyDir));

    // 1. Broad soft studio halo
    float halo = pow(grazing, 2.2) * 0.22 * mix(0.4, 1.0, lit);
    gl_FragColor.rgb += vec3(halo) * vec3(0.99, 0.98, 0.96);

    // 2. Chromatic contour split
    float rimR = pow(grazing, 4.6);
    float rimG = pow(grazing, 5.6);
    float rimB = pow(grazing, 6.6);
    vec3 split = vec3(rimR, rimG, rimB) * 0.28 * mix(1.0, 0.7, lit);
    vec3 dispersion = mix(vec3(0.92, 0.97, 1.06), vec3(1.04, 0.98, 0.90), lit);
    gl_FragColor.rgb += split * dispersion;

    // 3. Inner shade: dark refractive band showing wall thickness
    float band = pow(grazing, 2.2) * (1.0 - pow(grazing, 9.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.38, 0.38, 0.40), band * ${innerShade.toFixed(2)});

    // 4. Solid crystal glass base beneath cavity (Y between -1.741 and -1.226)
    float isBase = smoothstep(-1.20, -1.25, vModelPos.y);
    if (isBase > 0.001) {
      float baseCorner = (1.0 - smoothstep(-1.741, -1.68, vModelPos.y)) * 0.35;
      float baseInternal = smoothstep(-1.70, -1.26, vModelPos.y) * pow(grazing, 1.6) * 0.22;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.35, 0.35, 0.38), isBase * (baseCorner + baseInternal));
      gl_FragColor.a = clamp(gl_FragColor.a + isBase * 0.16, 0.0, 0.70);
    }

    // 5. Alpha gathers toward edges, leaving center clear
    gl_FragColor.a = clamp(gl_FragColor.a + pow(grazing, 2.6) * 0.42, 0.0, 0.65);
  }`,
      );
  };
  material.needsUpdate = true;
}

/**
 * Advanced liquid shader matching reference photo:
 * - Real-time slosh physics
 * - High-definition top meniscus line with specular glint
 * - Crisp refractive inner side walls
 * - Rounded bottom bowl with concentric caustic rings
 * - Pure water clarity for clear fragrances, rich translucency for colored fragrances
 */
function applyLiquidShader(
  material: MeshPhysicalMaterial,
  uniforms: LiquidUniforms,
  bodyBottom: number = -1.226,
  bodyTop: number = 0.785,
  cacheKey: string = "liquid_tornado_v37",
): void {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uSlosh = uniforms.uSlosh;
    shader.uniforms.uWaveTime = uniforms.uWaveTime;
    shader.uniforms.uWaveIntensity = uniforms.uWaveIntensity;
    shader.uniforms.uVortexStrength = uniforms.uVortexStrength;
    shader.uniforms.uVortexPhase = uniforms.uVortexPhase;
    shader.uniforms.uVortexDirection = uniforms.uVortexDirection;
    shader.uniforms.uBodyBottom = { value: bodyBottom };
    shader.uniforms.uBodyTop = { value: bodyTop };

    // Vertex displacement for real-time slosh physics and dynamic tornado vortex
    shader.vertexShader =
      `uniform vec2 uSlosh;\nuniform float uWaveTime;\nuniform float uWaveIntensity;\nuniform float uVortexStrength;\nuniform float uVortexPhase;\nuniform float uVortexDirection;\nvarying float vBodyY;\nvarying vec3 vModelPos;\nvarying float vNormR;\nvarying float vVortexFunnel;\n` +
      shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
  {
    float hFactor = smoothstep(-0.2, 1.15, transformed.y);
    float sloshTilt = clamp((position.x * uSlosh.x + position.z * uSlosh.y) * hFactor, -0.22, 0.22);

    // Radial distance from central axis (dip tube center at x=0, z=0)
    float r = length(position.xz);
    float normR = clamp(r / 1.134, 0.0, 1.0);
    vNormR = normR;

    // 1. TORNADO SURFACE VORTEX FUNNEL:
    // Parabolic surface depression: central core dips down around the dip tube, perimeter climbs up the glass walls
    float surfaceTaper = smoothstep(-0.15, 0.82, position.y);
    float funnelShape = (normR * normR * 1.75 - 0.70); // Parabolic profile conserving fluid volume
    float coreEye = (1.0 - smoothstep(0.0, 0.35, normR)) * 0.40;
    float vortexDepression = (funnelShape - coreEye) * uVortexStrength * 0.24 * surfaceTaper;

    transformed.y += sloshTilt + vortexDepression;

    vVortexFunnel = uVortexStrength * surfaceTaper;
    vBodyY = position.y;
    vModelPos = position;
  }`,
    );

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

    // Tornado funnel slope normal: sloping inward toward central vortex core
    float rNorm = clamp(length(position.xz) / 1.134, 0.0, 1.0);
    if (rNorm > 0.001) {
      vec2 rDir = normalize(position.xz);
      float surfaceTaper = smoothstep(-0.15, 0.82, position.y);
      float slope = (1.0 - rNorm * 0.4) * uVortexStrength * 0.65 * surfaceTaper;
      transformedNormal.x -= rDir.x * slope;
      transformedNormal.z -= rDir.y * slope;
      transformedNormal = normalize(transformedNormal);
    }
  }`,
    );

    // Fragment shader
    shader.fragmentShader =
      `uniform float uBodyBottom;\nuniform float uBodyTop;\nuniform float uVortexStrength;\nuniform float uVortexPhase;\nuniform float uVortexDirection;\nvarying float vBodyY;\nvarying vec3 vModelPos;\nvarying float vNormR;\nvarying float vVortexFunnel;\n` +
      shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float normY = clamp((vBodyY - uBodyBottom) / max(0.0001, uBodyTop - uBodyBottom), 0.0, 1.0);

    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float grazing = 1.0 - cosTheta;

    // Detect whether liquid is clear water or colored fragrance
    float maxC = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
    float minC = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
    float sat = (maxC - minC) / max(maxC, 0.001);
    float isClear = 1.0 - smoothstep(0.04, 0.10, sat);

    // =========================================================================
    // 1. TOP MENISCUS (surface line across bottle at normY ~0.97 - 0.99)
    // Razor-sharp dark refractive horizon line with glistening specular highlight
    // =========================================================================
    float climb = pow(grazing, 2.2) * 0.012;
    float curvedNormY = clamp(normY - climb, 0.0, 1.0);
    float meniscusDark = smoothstep(0.972, 0.984, curvedNormY) * (1.0 - smoothstep(0.984, 0.996, curvedNormY)) * 2.8;
    float meniscusSpec = pow(smoothstep(0.978, 0.988, curvedNormY) * (1.0 - smoothstep(0.988, 0.997, curvedNormY)), 2.0) * 1.2;

    // =========================================================================
    // 2. INNER LIQUID SIDE WALLS
    // Dark refractive boundary where liquid touches inner glass wall (grazing angle)
    // =========================================================================
    float sideWall = pow(grazing, 2.5) * smoothstep(0.06, 0.14, normY) * (1.0 - smoothstep(0.94, 0.98, normY)) * 1.1;

    // =========================================================================
    // 3. ROUNDED BOTTOM BOWL & CONCENTRIC CAUSTIC RINGS
    // The concave bowl at the bottom of the perfume liquid matching reference photo
    // =========================================================================
    // 3D curved silhouette of the rounded bowl down to the apex (smooth U-curve, no flat bar)
    float isBowl = 1.0 - smoothstep(-1.226, -1.030, vModelPos.y);
    float bowlCurvedSilhouette = isBowl * pow(grazing, 1.8) * 1.4;

    // Soft apex shadow at the lowest point of the bowl
    float bowlApexShade = (1.0 - smoothstep(-1.226, -1.160, vModelPos.y)) * 0.45;

    // Concentric caustic rings in the curved bowl (central and outer rings centered on dip tube)
    float r = length(vModelPos.xz);
    float normR = clamp(r / 1.134, 0.0, 1.0);
    float centralRing = smoothstep(0.20, 0.30, normR) * (1.0 - smoothstep(0.30, 0.42, normR));
    float outerRing = smoothstep(0.55, 0.65, normR) * (1.0 - smoothstep(0.65, 0.78, normR));
    float causticRings = isBowl * (centralRing * 1.3 + outerRing * 0.8) * 0.45;

    float bottomBowl = clamp(bowlCurvedSilhouette + bowlApexShade + causticRings, 0.0, 1.0);

    // =========================================================================
    // 3.5. TORNADO VORTEX FUNNEL & SWIRLING SPIRAL CAUSTICS
    // Active while the bottle rotates, creating a physical whirlpool / tornado
    // =========================================================================
    // Dynamic tornado spiral arms winding inward around the dip tube
    float polarAngle = atan(vModelPos.z, vModelPos.x);
    float spiralArms1 = sin(polarAngle * 2.0 - vNormR * 7.5 + uVortexPhase * 3.2);
    float spiralArms2 = sin(polarAngle * 2.0 - vNormR * 7.5 + uVortexPhase * 3.2 + 3.14159);
    float spiralIntensity = max(spiralArms1, spiralArms2);
    spiralIntensity = pow(clamp(spiralIntensity, 0.0, 1.0), 3.0) * uVortexStrength * smoothstep(0.08, 0.95, normY);

    // Tornado funnel eye: conical core narrowing from top surface down toward the base
    float funnelRadius = mix(0.12, 0.44, normY);
    float distToFunnel = abs(vNormR - funnelRadius);
    float funnelWall = smoothstep(0.15, 0.02, distToFunnel) * uVortexStrength * smoothstep(0.12, 0.95, normY);

    // Glistening highlight on the spinning tornado funnel rim
    float funnelHighlight = pow(funnelWall, 1.8) * pow(grazing, 1.4) * 1.6;
    float tornadoEffect = clamp(spiralIntensity * 0.65 + funnelWall * 0.75, 0.0, 1.0);

    // =========================================================================
    // 4. COMBINED REFRACTIVE CONTOURS & COLOR COMPOSITING
    // Consistent optical behavior across all fragrances (colored and crystal water)
    // =========================================================================
    float refractContours = clamp(meniscusDark + sideWall + bottomBowl + tornadoEffect * 0.65, 0.0, 1.0);

    // Deep refractive contour tone derived from the liquid's own body color
    vec3 darkRefract = mix(gl_FragColor.rgb * 0.32, vec3(0.26, 0.26, 0.28), 0.35);

    // Blend refractive contours into RGB
    gl_FragColor.rgb = mix(gl_FragColor.rgb, darkRefract, refractContours * 0.72);
    // Add specular glint to meniscus, caustic rings, and tornado funnel
    gl_FragColor.rgb += vec3(meniscusSpec) + vec3(causticRings * 0.15) + vec3(funnelHighlight) * 0.85 + vec3(spiralIntensity * 0.22);

    // Beer-Lambert depth density (richer body toward the curved bottom bowl)
    float density = (1.0 - normY) * (1.0 - normY);
    gl_FragColor.rgb *= mix(1.0, 0.88, density * 0.65);

    // Consistent translucent depth across all fragrances
    float baseAlpha = 0.28;
    gl_FragColor.a = clamp(baseAlpha + refractContours * 0.42 + meniscusSpec * 0.35 + funnelWall * 0.25, 0.0, 0.90);
  }`,
    );
  };
  material.needsUpdate = true;
}

/**
 * Derives color for liquid: clear water (#ffffff) for near-white/colorless fragrances,
 * or authentic rich fragrance hex for colored fragrances.
 */
export function getFragranceLiquidColor(hex?: string): Color {
  const col = new Color(hex || "#ffffff");
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);

  // Clear / colorless fragrances (e.g. #e5e5e5, #ffffff, s < 0.06 or l > 0.88 with low s)
  if (hsl.s < 0.06 || (hsl.s < 0.12 && hsl.l > 0.85)) {
    return new Color(0xffffff);
  }

  // Lift extremely dark hues slightly so depth is rich rather than opaque pitch-black
  if (hsl.l < 0.22) {
    col.setHSL(hsl.h, hsl.s, 0.28);
  }

  return col;
}

// Backward compatibility alias
export const normalizeLiquidColor = getFragranceLiquidColor;

interface BottleGltfProps extends Omit<ThreeElements["group"], "ref"> {
  refs: BottleRefs;
  /**
   * The fragrance's starting colour (optional fallback).
   */
  liquidColor?: string;
  /**
   * Fired once the refs below are wired.
   */
  onReady?: () => void;
}

/**
 * The product itself, rendered directly using the materials authored in Blender.
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
   * bounding-box centre on the origin.
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

/**
 * Subtle edge shader for the dip tube:
 * Highlights the cylindrical flanks of the plastic straw so it is clearly
 * visible through both clear water and rich translucent perfume.
 */
function applyDipTubeShader(material: MeshPhysicalMaterial, cacheKey: string = "tube_shader_v3") {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float grazing = 1.0 - cosTheta;
    float edgeHighlight = pow(grazing, 2.0) * 0.35;
    gl_FragColor.rgb += vec3(edgeHighlight);
    gl_FragColor.a = clamp(gl_FragColor.a + edgeHighlight * 0.25, 0.0, 0.95);
  }`,
    );
  };
  material.needsUpdate = true;
}

  // Dedicated dip tube material (thin plastic inside liquid)
  // Follows user's exact specification:
  // - tubeColor derived from liquidColor (lerped with #ffffff, lower saturation)
  // - transparent: true, roughness: 0.35
  const tubeMat = useMemo(() => {
    const mat = new MeshPhysicalMaterial({
      roughness: 0.35,
      metalness: 0,
      clearcoat: 0.40,
      clearcoatRoughness: 0.08,
      depthWrite: false,
      transparent: true,
      side: FrontSide,
    });
    applyDipTubeShader(mat, "tube_init_v3");
    return mat;
  }, []);

  useEffect(() => {
    return () => {
      tubeMat.dispose();
    };
  }, [tubeMat]);

  // Update tube color in-place when liquidColor changes
  useLayoutEffect(() => {
    const norm = getFragranceLiquidColor(liquidColor);
    const hsl = { h: 0, s: 0, l: 0 };
    norm.getHSL(hsl);

    // Uniformly derive the clear plastic dip tube color for all fragrances:
    // Lighter, desaturated plastic with soft sheen and subtle emissive lift
    const tubeColor = new Color();
    const s = hsl.s * 0.45;
    const l = Math.min(0.88, Math.max(0.72, hsl.l + 0.30));
    tubeColor.setHSL(hsl.h, s, l);

    tubeMat.color.copy(tubeColor);
    tubeMat.emissive.copy(tubeColor).multiplyScalar(0.25);
    tubeMat.opacity = 0.65;
    invalidate();
  }, [liquidColor, tubeMat, invalidate]);

  useLayoutEffect(() => {
    const glass = gltf.scene.getObjectByName(NODE.glass) as Mesh | undefined;
    const capGlass = gltf.scene.getObjectByName(NODE.capGlass) as Mesh | undefined;
    const liquid = gltf.scene.getObjectByName(NODE.liquid) as Mesh | undefined;
    const dipTube = gltf.scene.getObjectByName(NODE.dipTube) as Mesh | undefined;
    const cap = gltf.scene.getObjectByName(NODE.cap);
    const pumpButton = gltf.scene.getObjectByName(NODE.pumpButton);
    const nozzle = gltf.scene.getObjectByName(NODE.nozzle) ?? null;

    // Set draw order so transmissive inner objects render before the outer glass
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        (o as Mesh).renderOrder = RENDER_ORDER.rest;
      }
    });

    if (dipTube) {
      dipTube.material = tubeMat;
      dipTube.renderOrder = RENDER_ORDER.dipTube;
    }

    if (liquid) {
      liquid.renderOrder = RENDER_ORDER.liquid;
      const liquidMat = liquid.material as MeshPhysicalMaterial;
      liquidMat.transparent = true;
      liquidMat.depthWrite = false;
      liquidMat.transmission = 0;
      liquidMat.roughness = 0.02;
      liquidMat.metalness = 0;
      liquidMat.clearcoat = 0.75;
      liquidMat.clearcoatRoughness = 0.03;
      liquidMat.ior = 1.333;
      liquidMat.reflectivity = 0.8;

      if (liquidColor) {
        liquidMat.color.copy(getFragranceLiquidColor(liquidColor));
      }

      applyLiquidShader(
        liquidMat,
        liquidUniformsRef.current,
        -1.226,
        0.785,
        "liquid_tornado_v37",
      );
    }

    if (glass) {
      glass.renderOrder = RENDER_ORDER.glass;
      const glassMat = glass.material as MeshPhysicalMaterial;
      glassMat.transparent = true;
      glassMat.depthWrite = false;
      glassMat.transmission = 0;
      glassMat.opacity = 0.06;
      glassMat.roughness = 0.02;
      glassMat.metalness = 0;
      glassMat.clearcoat = 0.85;
      glassMat.clearcoatRoughness = 0.01;
      glassMat.ior = 1.5;
      glassMat.reflectivity = 0.8;
      glassMat.color.set(0xffffff);

      applyGlassShader(glassMat, 0.45, "glass_edge_crystal_bottle_v22");
    }

    if (capGlass) {
      capGlass.renderOrder = RENDER_ORDER.glass;
      const capMat = capGlass.material as MeshPhysicalMaterial;
      capMat.transparent = true;
      capMat.depthWrite = false;
      capMat.transmission = 0;
      capMat.opacity = 0.18;
      capMat.roughness = 0.02;
      capMat.metalness = 0;
      capMat.clearcoat = 0.85;
      capMat.clearcoatRoughness = 0.01;
      capMat.ior = 1.5;
      capMat.reflectivity = 0.8;
      capMat.color.set(0xffffff);

      applyGlassShader(capMat, 0.35, "glass_edge_crystal_cap_v22");
    }

    refs.glass.current = glass ?? null;
    refs.liquid.current = liquid ?? null;
    refs.liquidMaterial.current = (liquid?.material as MeshPhysicalMaterial) ?? null;
    refs.dipTube.current = dipTube ?? null;
    refs.cap.current = cap ?? null;
    refs.pumpButton.current = pumpButton ?? null;
    refs.nozzle.current = nozzle;

    invalidate();
    onReady?.();
  }, [gltf, refs, invalidate, onReady, liquidColor, tubeMat]);

  return (
    <group ref={refs.root} {...groupProps}>
      <group scale={fit.scale} position={fit.offset} rotation-y={NOZZLE_YAW}>
        <primitive object={gltf.scene} />
        <OilBubbles uniforms={liquidUniformsRef.current} liquidColor={liquidColor} />
      </group>
    </group>
  );
}
