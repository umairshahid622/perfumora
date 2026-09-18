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
  material.customProgramCacheKey = () => "liquid_slosh_shader_v35";
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

    // Beer-Lambert volume density: deeper absorption toward bottom
    float density = (1.0 - bodyT) * (1.0 - bodyT);

    // Rich saturated jewel-toned color vibrance
    vec3 luma = vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)));
    vec3 jewel = mix(luma, gl_FragColor.rgb, 1.30);

    // Subtle internal liquid translucency (soft backlight illumination)
    vec3 keyDir = vec3(0.5517, 0.4138, 0.7241);
    float backScatter = max(0.0, -dot(normalize(vNormal), keyDir)) * 0.18;

    // Glowing translucent liquid body: sheer, rich jewel tone throughout, deepening toward base
    gl_FragColor.rgb = jewel * (1.02 + backScatter) * mix(1.0, 0.88, density);

    // Meniscus surface tension glint (subtle, delicate catchlight)
    float meniscus = smoothstep(0.93, 0.99, bodyT);
    gl_FragColor.rgb += vec3(0.18, 0.16, 0.14) * meniscus;

    // Sheer, radiant translucent perfume fluid: allows background elements & internal reflections to filter through
    gl_FragColor.a = clamp(0.36 + density * 0.20 + meniscus * 0.12, 0.18, 0.65);
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
  rimStrength: number = 0.24,
  alphaGather: number = 0.35,
  baseAlpha: number = 0.02,
  cacheKey: string = "glass_edge_liquid_v35",
): void {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // 1. Pass local vertex position to fragment shader for heavy base and shoulder detection
    shader.vertexShader = `varying vec3 vGlassPos;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n  vGlassPos = position;\n`,
    );

    // 2. Liquid Glass fragment shader
    shader.fragmentShader = `varying vec3 vGlassPos;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float grazing = 1.0 - cosTheta;

    // Direct key light vector [3.2, 2.4, 4.2]
    vec3 keyDir = vec3(0.5517, 0.4138, 0.7241);
    float lit = smoothstep(-0.25, 0.85, dot(normalize(vNormal), keyDir));

    // 1. Soft vertical studio softbox reflection stripes (subtle silky sheen, not blinding glare)
    // Delicate key softbox ribbon along right curved flank of the bottle cylinder
    float keyStripe = smoothstep(0.50, 0.75, vNormal.x) * smoothstep(0.94, 0.75, vNormal.x);
    float keySoftbox = pow(keyStripe, 2.0) * 0.28;

    // Delicate fill softbox ribbon along left curved flank
    float fillStripe = smoothstep(-0.48, -0.72, vNormal.x) * smoothstep(-0.92, -0.72, vNormal.x);
    float fillSoftbox = pow(fillStripe, 2.0) * 0.18;

    // 2. Delicate Prismatic Chromatic Dispersion along outer curved boundary
    float rimR = pow(grazing, 3.2);
    float rimG = pow(grazing, 3.8);
    float rimB = pow(grazing, 4.6);
    vec3 chromaticSplit = vec3(rimR, rimG, rimB) * ${rimStrength.toFixed(2)};
    vec3 dispersionTint = mix(vec3(0.92, 0.96, 1.15), vec3(1.15, 1.04, 0.90), lit);

    // 3. Heavy Solid Crystal Base ("Culot" / Ice Base) - soft internal caustic glow
    float isBase = smoothstep(-0.80, -1.28, vGlassPos.y);
    float baseCaustic = 0.0;
    if (isBase > 0.001) {
      baseCaustic = pow(grazing, 1.8) * isBase * 0.25;
    }

    // 4. Subtle curved flacon shoulder glint
    float isShoulder = smoothstep(0.32, 0.58, vGlassPos.y) * smoothstep(0.92, 0.58, vGlassPos.y);
    float shoulderGlint = 0.0;
    if (isShoulder > 0.001) {
      vec3 halfVec = normalize(keyDir + normalize(vViewPosition));
      shoulderGlint = pow(max(0.0, dot(normalize(vNormal), halfVec)), 28.0) * isShoulder * 0.16 * lit;
    }

    // Add optical liquid glass elements to RGB
    gl_FragColor.rgb += vec3(keySoftbox + fillSoftbox + shoulderGlint + baseCaustic);
    gl_FragColor.rgb += chromaticSplit * dispersionTint;

    // 5. Alpha dynamics for crystal clarity without excessive shine/opacity:
    // Crystal clear at normal incidence (baseAlpha ~0.02), gently rising on softbox stripes,
    // grazing edges, and crystal base.
    float edgeAlpha = pow(grazing, 2.6) * ${alphaGather.toFixed(2)};
    float softboxAlpha = (keySoftbox + fillSoftbox + shoulderGlint) * 0.50;
    float baseAlpha = isBase * 0.16;

    gl_FragColor.a = clamp(
      ${baseAlpha.toFixed(2)} + edgeAlpha + softboxAlpha + baseAlpha,
      0.0,
      0.62
    );
  }`,
    );
  };
  material.needsUpdate = true;
}

/**
 * The nozzle's horizontal offset from the pump button it hangs off, read from the
 * asset (`nozzle.translation`). The spout runs along that offset, so it is not
 * quite parallel to the model's own -Z — hence the trim in the yaw below.
 */
const NOZZLE_OFFSET = { x: 0.151, z: -1.134 } as const;

/**
 * Yaw that puts the pump's spout straight at the camera.
 *
 * `PI` turns the model's -Z (the spout, see the group below) to face front;
 * `atan2` then takes out the few degrees the nozzle's own sideways offset leaves
 * in it, so the spout lands on +Z exactly rather than 7.6° off it.
 */
const NOZZLE_YAW =
  Math.PI + Math.atan2(NOZZLE_OFFSET.x, -NOZZLE_OFFSET.z);

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

    // Refined Liquid Glass physical material definition:
    // Gentle clearcoat and subtle microscopic roughness eliminate harsh mirror glare.
    const configureGlassMaterial = (mat: MeshPhysicalMaterial, opacity: number = 0.02) => {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.transmission = 0;
      mat.opacity = opacity;
      mat.roughness = 0.035;
      mat.metalness = 0.0;
      mat.clearcoat = 0.60;
      mat.clearcoatRoughness = 0.05;
      mat.ior = 1.52;
      mat.reflectivity = 0.45;
      mat.color.set(0x000000);
    };

    // The bottle flacon wall keeps crystal clarity with heavy crystal base
    configureGlassMaterial(glass.material as MeshPhysicalMaterial, 0.02);
    configureGlassMaterial(capGlass.material as MeshPhysicalMaterial, 0.04);

    // Liquid Glass optical edge shaders (softened studio sheen, delicate chromatic rim)
    applyGlassEdge(glass.material as MeshPhysicalMaterial, 0.24, 0.35, 0.02, "glass_edge_bottle_v35");
    applyGlassEdge(capGlass.material as MeshPhysicalMaterial, 0.26, 0.30, 0.03, "glass_edge_cap_v35");

    // Luminous luxury fragrance liquid — sheer translucent clarity
    const liquidMat = liquid.material as MeshPhysicalMaterial;
    liquidMat.transparent = true;
    liquidMat.depthWrite = false;
    liquidMat.transmission = 0;
    liquidMat.opacity = 0.45;
    liquidMat.roughness = 0.02;
    liquidMat.metalness = 0.0;
    liquidMat.clearcoat = 0.70;
    liquidMat.clearcoatRoughness = 0.03;
    liquidMat.ior = 1.333;
    liquidMat.reflectivity = 0.70;

    // Translucent dip tube, submerged within liquid
    const tubeMat = dipTube.material as MeshPhysicalMaterial;
    tubeMat.transparent = true;
    tubeMat.depthWrite = false;
    tubeMat.transmission = 0;
    tubeMat.opacity = 0.22;
    tubeMat.color.set(0xffffff);
    tubeMat.roughness = 0.04;
    tubeMat.clearcoat = 0.5;

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
    refs.nozzle.current = gltf.nodes[NODE.nozzle] ?? gltf.scene.getObjectByName(NODE.nozzle) ?? null;

    invalidate();
    // Last, so the motion hooks that react to this only ever see fully wired refs.
    onReady?.();
  }, [gltf, refs, invalidate, onReady, liquidColor]);

  return (
    <group ref={refs.root} {...groupProps}>
      {/*
       * Bottle orientation.
       *
       * `NOZZLE_YAW` is chosen for the *nozzle*. The asset's spout runs along the
       * model's own **-Z**: the `nozzle` node sits at `z = -1.134` relative to
       * `automizerButton`, and the orifice sphere is the `z[-1.158..-0.794]` end of
       * that button's geometry. The yaw turns that to world **+Z** — straight at
       * the camera — so the pump faces the customer and the mist has somewhere
       * sensible to go.
       *
       * It used to be `-PI/2`, which was chosen for the dip tube's curve and sent
       * the spout to world **+X**: hard right, a full quarter turn off front, which
       * is what read as the nozzle pointing sideways. The tube's curve is now on
       * the other side; the bottle is otherwise symmetric, so that is the only
       * cost.
       */}
      <group scale={fit.scale} position={fit.offset} rotation-y={NOZZLE_YAW}>
        <primitive object={gltf.scene} />
      </group>
    </group>
  );
}
