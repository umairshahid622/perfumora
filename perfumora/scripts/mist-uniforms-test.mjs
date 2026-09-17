/**
 * Reproduces R3F v9.7.0's exact update path for a mounted <shaderMaterial> whose
 * `uniforms` prop changes (what happens when `color` changes and `useMemo`
 * produces a new uniforms object), then asks the one question that matters:
 *
 *   after the variant change, does the ShaderMaterial still render with the SAME
 *   uniforms object the per-frame writer holds a reference to?
 *
 * If the two diverge, the frame loop writes uGlobalOpacity/uTime into an object the
 * material never reads, uGlobalOpacity stays at its fresh default of 0, and the
 * mist is invisible — exactly the reported symptom.
 *
 * The three functions below are transcribed from
 * node_modules/@react-three/fiber/dist/events-b1bdeb1a.cjs.dev.js
 * (applyProps @397, invalidateInstance @503, is.equ @134, diffProps @348),
 * abridged to the branches this prop combination can hit.
 */
import * as THREE from "three";

const RESERVED_PROPS = ["args", "dispose", "attach", "object", "onUpdate", "children", "key", "ref"];

const is = {
  obj: (a) => a === Object(a) && !Array.isArray(a) && typeof a !== "function",
  equ(a, b, { objects = "reference", strict = true } = {}) {
    if (typeof a !== typeof b || !!a !== !!b) return false;
    if (typeof a === "string" || typeof a === "number" || typeof a === "boolean") return a === b;
    const isObj = is.obj(a);
    if (isObj && objects === "reference") return a === b;
    return a === b;
  },
};

// createMistUniforms, as in useMistPhysics.ts
function createMistUniforms(color, uGlobalOpacity = 0, uTime = 0) {
  return {
    uTime: { value: uTime },
    uGravity: { value: new THREE.Vector3(0, -2.4, 0) },
    uColor: { value: new THREE.Color(color) },
    uGlobalOpacity: { value: uGlobalOpacity },
    uBaseSize: { value: 0.042 },
    uPixelRatio: { value: 1.5 },
  };
}

function resolve(object, prop) {
  return { root: object, key: prop, target: object[prop] };
}

// R3F applyProps — the branches reachable for a ShaderMaterial with `uniforms`.
function applyProps(object, props) {
  const instance = object.__r3f;
  for (const prop in props) {
    const value = props[prop];
    if (RESERVED_PROPS.includes(prop)) continue;
    if (value === undefined) continue;
    const { root, key } = resolve(object, prop);

    if (root instanceof THREE.ShaderMaterial && key === "uniforms" && is.obj(value)) {
      // "ShaderMaterial uniforms must keep a stable target reference"
      if (!is.obj(root.uniforms)) root.uniforms = {};
      const uniforms = root.uniforms;
      const nextUniforms = value;
      for (const name in nextUniforms) {
        const uniform = nextUniforms[name];
        const targetUniform = uniforms[name];
        if (targetUniform) Object.assign(targetUniform, uniform);
        else uniforms[name] = { ...uniform };
      }
    } else {
      root[key] = value;
    }
  }
  invalidateInstance(instance);
  return object;
}

// R3F invalidateInstance — this is what dispatches onUpdate.
function invalidateInstance(instance) {
  if (!instance.parent) return; // <-- the early return worth testing
  instance.props.onUpdate?.(instance.object);
}

// R3F diffProps — decides whether applyProps runs at all.
function diffProps(instance, newProps) {
  const changedProps = {};
  for (const prop in newProps) {
    if (RESERVED_PROPS.includes(prop)) continue;
    if (is.equ(newProps[prop], instance.props[prop])) continue;
    changedProps[prop] = newProps[prop];
  }
  return changedProps;
}

// ---------------------------------------------------------------------------
// Scene + mount
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const material = new THREE.ShaderMaterial({ uniforms: {} });
// r3f instance descriptor, as created by prepare()
const instance = {
  parent: scene,
  root: { getState: () => ({ internal: { frames: 1 } }) },
  object: material,
  props: {},
  eventCount: 0,
  handlers: {},
};
material.__r3f = instance;

// The per-frame writer in useMistPhysics holds this ref, refreshed by an effect
// whenever `useMemo` hands it a new uniforms object.
let frameLoopUniforms;

function mount(uniforms, onUpdate) {
  instance.props = { ...instance.props, uniforms, onUpdate };
  frameLoopUniforms = uniforms;
  applyProps(material, { uniforms, transparent: true, depthWrite: false, opacity: 0 });
}

function commitUpdate(newProps) {
  const changedProps = diffProps(instance, newProps);
  instance.props = { ...instance.props, ...newProps };
  if (Object.keys(changedProps).length) applyProps(material, changedProps);
  return changedProps;
}

// ---------------------------------------------------------------------------
// FIRST LOAD — one uniforms object, no divergence is even possible
// ---------------------------------------------------------------------------
const U1 = createMistUniforms("#b87333");
mount(U1, (mat) => {
  mat.uniforms = U1;
});

// A first spray: frame loop writes peak opacity + time into its uniforms
frameLoopUniforms.uGlobalOpacity.value = 0.88;
frameLoopUniforms.uTime.value = 0.6;

const firstRenderOpacity = material.uniforms.uGlobalOpacity.value;
const firstRenderTime = material.uniforms.uTime.value;
console.log("--- after first load + one spray ---");
console.log("frameLoopUniforms === material.uniforms :", frameLoopUniforms === material.uniforms);
console.log("uGlobalOpacity reaching the shader      :", firstRenderOpacity);
console.log("uTime reaching the shader               :", firstRenderTime);

// ---------------------------------------------------------------------------
// VARIANT CHANGE — new color -> useMemo returns a NEW uniforms object U2
// ---------------------------------------------------------------------------
const U2 = createMistUniforms("#7a5c61"); // fresh defaults: opacity 0, time 0
const newOnUpdate = (mat) => {
  mat.uniforms = U2;
};

const changed = commitUpdate({
  uniforms: U2,
  onUpdate: newOnUpdate,
});
console.log("\n--- variant change commit ---");
console.log("props R3F flagged as changed           :", Object.keys(changed));
console.log("onUpdate is reserved (skipped by diff)  :", !("onUpdate" in changed));

// The frame loop's effect has now run, so it points at U2
frameLoopUniforms = U2;

// A second spray: GSAP tweens material.opacity to peak; frame loop mirrors it
material.opacity = 0.88;
frameLoopUniforms.uGlobalOpacity.value = material.opacity;
frameLoopUniforms.uTime.value = 0.6;

console.log("\n--- after the variant change + second spray ---");
console.log("frameLoopUniforms === material.uniforms :", frameLoopUniforms === material.uniforms);
console.log("uGlobalOpacity reaching the shader      :", material.uniforms.uGlobalOpacity.value);
console.log("uTime reaching the shader               :", material.uniforms.uTime.value);

const works = material.uniforms === frameLoopUniforms && material.uniforms.uGlobalOpacity.value === 0.88;
console.log("\n=== RESULT (onUpdate fired) ===");
console.log(works ? "MECHANISM OK — uniforms stay in sync; the bug is elsewhere." : "DIVERGED — the material renders with stale uniforms; this IS the bug.");

// ---------------------------------------------------------------------------
// THE FAILURE BRANCH: invalidateInstance early-returns when the instance has no
// parent (and onUpdate is the *only* thing that re-points mat.uniforms). If it
// does not fire, the merge has already copied U2's fresh defaults into the
// material's stable uniforms object, and the frame loop is now writing into U2
// while the material still renders with the stable object. uGlobalOpacity is
// left at 0 there for good.
// ---------------------------------------------------------------------------
console.log("\n--- same variant change, onUpdate suppressed (no parent) ---");
instance.parent = null; // the early return in invalidateInstance

const U3 = createMistUniforms("#3d5a73");
frameLoopUniforms = U3;
const changed3 = diffProps(instance, {
  uniforms: U3,
  onUpdate: (mat) => { mat.uniforms = U3; },
});
instance.props = { ...instance.props, uniforms: U3 };
if (Object.keys(changed3).length) applyProps(material, changed3);
// (onUpdate never ran — invalidateInstance returned early)

material.opacity = 0.88;
frameLoopUniforms.uGlobalOpacity.value = material.opacity;

console.log("frameLoopUniforms === material.uniforms :", frameLoopUniforms === material.uniforms);
console.log("uGlobalOpacity reaching the shader      :", material.uniforms.uGlobalOpacity.value);
const diverged = material.uniforms !== frameLoopUniforms && material.uniforms.uGlobalOpacity.value === 0;
console.log("\n=== RESULT (onUpdate suppressed) ===");
console.log(diverged ? "DIVERGED — uGlobalOpacity stuck at 0 → mist INVISIBLE. The mechanism is only as safe as onUpdate." : "still in sync");

// ---------------------------------------------------------------------------
// THE FIX, simulated: `useMemo(() => createMistUniforms(...), [])` keeps one
// object for the component's life, and the frame loop reads the uniforms off the
// material rather than off the memo. A variant change no longer produces a
// second object, so there is nothing to diverge from — and even if the material
// were ever handed a different object, the writer follows it.
// ---------------------------------------------------------------------------
console.log("\n--- with the fix: stable uniforms + read off the material ---");
instance.parent = scene; // restored, but the fix must not depend on this

const STABLE = createMistUniforms("#b87333");
mount(STABLE, (mat) => { mat.uniforms = STABLE; });

// first spray
material.opacity = 0.88;
(STABLE).uGlobalOpacity.value = material.opacity;
console.log("first spray uGlobalOpacity          :", material.uniforms.uGlobalOpacity.value);

// variant change: same object, so diffProps deems uniforms unchanged and
// applyProps does not run at all — the merge cannot touch anything
const changedFix = diffProps(instance, { uniforms: STABLE, onUpdate: (mat) => { mat.uniforms = STABLE; } });
instance.props = { ...instance.props, uniforms: STABLE };
if (Object.keys(changedFix).length) applyProps(material, changedFix);
console.log("props re-applied on variant change   :", Object.keys(changedFix));

// second spray — writer reads off the material now
const fixedUniforms = material.uniforms ?? STABLE;
material.opacity = 0.88;
fixedUniforms.uGlobalOpacity.value = material.opacity;
fixedUniforms.uTime.value = 0.6;

console.log("writer === material uniforms         :", fixedUniforms === material.uniforms);
console.log("second spray uGlobalOpacity          :", material.uniforms.uGlobalOpacity.value);
console.log("second spray uTime                   :", material.uniforms.uTime.value);
const fixedOk = material.uniforms.uGlobalOpacity.value === 0.88 && material.uniforms.uTime.value === 0.6;
console.log("\n=== RESULT (with the fix) ===");
console.log(fixedOk ? "FIXED — the writer and the renderer share one object by construction; onUpdate is no longer load-bearing." : "still broken");
