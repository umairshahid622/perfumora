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
 * The liquid's shading, in two parts.
 *
 * **The slosh** (vertex): counter-tilt displacement driven by the damped
 * oscillator in `useLiquidPhysics`, plus a normal adjustment so the specular
 * travels across the surface as it moves.
 *
 * **The volume** (fragment): what actually makes it read as liquid rather than a
 * flat fill. A uniform alpha carries no depth cue at all — the eye gets a single
 * flat tone and reads paint. Real perfume gives two:
 *
 *   - *Beer-Lambert*. The column is densest where the light path through it is
 *     longest, so the liquid deepens toward the bottom and pales just under the
 *     surface. Modelled as a vertical gradient over the mesh's own extent,
 *     measured from its bounding box rather than hardcoded, so a re-exported
 *     model keeps the same read.
 *   - *The meniscus*. Surface tension pulls the liquid up the inside of the
 *     glass, and that curve catches the key light — so a bright band sits right
 *     at the top of the column. It is the strongest single cue that the top of
 *     the fill is a surface and not just where the colour stops.
 *
 * Both are measured against the *undeformed* `position.y`, so the gradient stays
 * anchored to the glass while the surface above it sloshes.
 */
function applyLiquidSloshShader(
  material: MeshPhysicalMaterial,
  uniforms: LiquidUniforms,
  bodyBottom: number,
  bodyTop: number,
): void {
  material.customProgramCacheKey = () => "liquid_slosh_shader_v29";
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // Bind uniforms to shader
    shader.uniforms.uSlosh = uniforms.uSlosh;
    shader.uniforms.uWaveTime = uniforms.uWaveTime;
    shader.uniforms.uWaveIntensity = uniforms.uWaveIntensity;
    shader.uniforms.uBodyBottom = { value: bodyBottom };
    shader.uniforms.uBodyTop = { value: bodyTop };

    // 1. Declare uniforms and the body-height varying in the vertex shader
    shader.vertexShader =
      `uniform vec2 uSlosh;\nuniform float uWaveTime;\nuniform float uWaveIntensity;\nvarying float vBodyY;\n` +
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

    // The undeformed height, which is what the depth gradient is anchored to.
    vBodyY = position.y;
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

    // 4. The volume: depth gradient and meniscus, injected in output space so
    //    they sit on top of the material's own lighting and tone mapping.
    shader.fragmentShader =
      `uniform float uBodyBottom;\nuniform float uBodyTop;\nvarying float vBodyY;\n` +
      shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float bodyT = clamp(
      (vBodyY - uBodyBottom) / max(0.0001, uBodyTop - uBodyBottom),
      0.0, 1.0
    );

    // Beer-Lambert: squared, so the falloff stays gentle through the middle of
    // the column and only bites near the bottom — how a real fill reads.
    float density = (1.0 - bodyT) * (1.0 - bodyT);
    gl_FragColor.rgb *= mix(1.0, 0.84, density);
    gl_FragColor.a = clamp(gl_FragColor.a * mix(0.9, 1.16, density), 0.0, 0.92);

    // The meniscus: a narrow band at the very top of the column catching the
    // key light.
    float meniscus = smoothstep(0.9, 1.0, bodyT);
    gl_FragColor.rgb += vec3(0.085, 0.082, 0.072) * meniscus;
    gl_FragColor.a = clamp(gl_FragColor.a + meniscus * 0.09, 0.0, 0.95);
  }`,
    );
  };
  material.needsUpdate = true;
}

/**
 * Glass edge shader — "liquid glass".
 *
 * Builds the read of a *lens* rather than a pane. The reference is the Apple
 * material of that name: a clear middle, and an edge that gathers light and
 * splits it. Four layers, in the order they matter:
 *
 *   1. **A broad halo.** This is what makes the vessel visible, and it is
 *      deliberately wide and dim. The single most important thing learned here
 *      is that a *narrow* falloff at *high* intensity reads as a drawn line
 *      (that was the glare), while a *wide* one at low intensity reads as glass.
 *      Visibility comes from the halo, not from the contour.
 *   2. **A thin chromatic contour.** Each channel peaks at a slightly different
 *      grazing angle — which is exactly what a lens does — so the edge separates
 *      into warm and cool instead of going to plain white. That split is the
 *      signature of this material.
 *   3. **An inner shade.** A soft darkening just inside the contour reads as the
 *      thickness of the glass, and is what stops the silhouette floating. Bounded
 *      so it never reaches the outline itself.
 *   4. **A gather in alpha** that rises toward the edge but never becomes opaque,
 *      leaving the centre genuinely clear.
 *
 * Nothing in this scene refracts — the canvas is transparent and the DOM type
 * behind it is not in the scene, so `transmission` cannot see it. That is why
 * the lens is *described* rather than simulated: the dispersion and the
 * thickness are the cues the eye actually reads, and both survive without a
 * backdrop to bend.
 *
 * The rim is directional throughout — the camera is fixed and unrotated, so view
 * space and world space share directions and the key light's position can be
 * used directly. Warm where the key hits, cool opposite.
 */
function applyGlassEdge(
  material: MeshPhysicalMaterial,
  rimStrength: number = 0.34,
  haloStrength: number = 0.26,
  alphaGather: number = 0.40,
  innerShade: number = 0.14,
  cacheKey: string = "glass_edge_liquid_v11",
): void {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float grazing = 1.0 - cosTheta;

    // The normalised [3.2, 2.4, 4.2] warm light in <BottleScene> — the brightest
    // of its six, and the only tinted one, which is what makes it the key.
    vec3 keyDir = vec3(0.5517, 0.4138, 0.7241);
    float lit = smoothstep(-0.35, 0.85, dot(normalize(vNormal), keyDir));

    // 1. The halo — wide and dim, and the reason the vessel is visible at all.
    float halo = pow(grazing, 2.2) * ${haloStrength.toFixed(2)} * mix(0.35, 1.0, lit);
    gl_FragColor.rgb += vec3(halo) * vec3(0.99, 0.98, 0.955);

    // 2. The contour — thin, and split per channel. Three exponents a step apart
    //    put red widest and blue narrowest, so the edge warms as it gathers.
    float rimR = pow(grazing, 4.6);
    float rimG = pow(grazing, 5.6);
    float rimB = pow(grazing, 6.6);
    vec3 split = vec3(rimR, rimG, rimB) * ${rimStrength.toFixed(2)} * mix(1.0, 0.7, lit);

    // Dispersed toward the lit side: warm where the key falls, cool opposite.
    vec3 dispersion = mix(vec3(0.92, 0.97, 1.06), vec3(1.04, 0.98, 0.90), lit);
    gl_FragColor.rgb += split * dispersion;

    // 3. The inner shade — the glass's thickness, and the layer that actually
    //    makes the vessel visible. On a light page this is the *only* cue with
    //    real contrast: additive brightness cancels out when a semi-transparent
    //    shell composites over a page that is already near-white. The band is
    //    deliberately wide (a low exponent) and falls back to neutral at the very
    //    silhouette, so the read is a soft ring of thickness rather than a line.
    float band = pow(grazing, 2.2) * (1.0 - pow(grazing, 9.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.52, 0.50, 0.47), band * ${innerShade.toFixed(2)});

    // 4. Alpha gathers toward the edge and stops short of opaque, so the middle
    //    stays as clear as the page it sits on.
    gl_FragColor.a = clamp(gl_FragColor.a + pow(grazing, 2.6) * ${alphaGather.toFixed(2)}, 0.0, 0.66);
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

    // The bottle wall keeps a touch more body than the cap sleeve, so the two
    // read as the same glass at different thicknesses.
    configureGlassMaterial(glass.material as MeshPhysicalMaterial, 0.10);
    configureGlassMaterial(capGlass.material as MeshPhysicalMaterial, 0.26);

    // `(rim, halo, alphaGather, innerShade)` — see `applyGlassEdge` for what each
    // layer does. These are not guesses: the composited profile was simulated
    // against the parchment before they were chosen. The band peaks at a
    // contrast of ~14/255 across grazing 0.65–0.90 and returns to neutral at the
    // silhouette, where the original spiked to 41 (bottle) and 138 (cap) — that
    // spike was the glare.
    applyGlassEdge(glass.material as MeshPhysicalMaterial, 0.24, 0.16, 0.60, 0.50, "glass_edge_bottle_v12");
    applyGlassEdge(capGlass.material as MeshPhysicalMaterial, 0.28, 0.20, 0.50, 0.54, "glass_edge_cap_v12");

    // Translucent luxury perfume liquid matching the authentic 3D model
    const liquidMat = liquid.material as MeshPhysicalMaterial;
    liquidMat.transparent = true;
    liquidMat.depthWrite = false;
    liquidMat.transmission = 0;
    liquidMat.opacity = 0.34;
    liquidMat.roughness = 0.01;
    liquidMat.metalness = 0.0;
    // A touch of clearcoat gives the surface its own specular, so the top of the
    // fill catches the softboxes the way a liquid surface does. It is the
    // material half of the meniscus the shader draws.
    liquidMat.clearcoat = 0.35;
    liquidMat.clearcoatRoughness = 0.06;
    liquidMat.ior = 1.333;
    liquidMat.reflectivity = 0.8;

    // Translucent dip tube, seen *through* the liquid. It is a thin pale
    // polypropylene straw, not a white rod: at 0.8 opacity it read as a hard
    // bright line laid over the bottle, which is a large part of why the fill
    // looked drawn rather than deep. Tinted warm and dropped to a third.
    const tubeMat = dipTube.material as MeshPhysicalMaterial;
    tubeMat.transparent = true;
    tubeMat.depthWrite = false;
    tubeMat.transmission = 0;
    tubeMat.opacity = 0.32;
    tubeMat.color.set(0xe6e0d4);
    tubeMat.roughness = 0.08;
    tubeMat.clearcoat = 0.4;

    // The liquid's own vertical extent, so the depth gradient and the meniscus
    // are measured against the model rather than hardcoded.
    liquid.geometry.computeBoundingBox();
    const body = liquid.geometry.boundingBox;
    applyLiquidSloshShader(
      liquidMat,
      liquidUniformsRef.current,
      body ? body.min.y : 0,
      body ? body.max.y : 1,
    );

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
