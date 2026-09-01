/**
 * Material parameters for the bottle, kept as plain data so the assembly
 * component stays declarative and the look is tunable in one place.
 *
 * Glass and liquid are drawn in three's transmissive pass. The canvas is
 * transparent (the Hero layers DOM type behind the model, §4.1), so the glass
 * gets most of its read from environment reflections rather than from
 * refracting an opaque backdrop.
 */

export const GLASS_MATERIAL = {
  color: "#ffffff",
  transmission: 1,
  roughness: 0.045,
  metalness: 0,
  ior: 1.5,
  thickness: 0.42,
  attenuationColor: "#eaf1f2",
  attenuationDistance: 4.5,
  specularIntensity: 1,
  envMapIntensity: 1.25,
  transparent: true,
  /** Glass draws last and does not occlude the liquid/dip tube behind it. */
  depthWrite: false,
} as const;

/**
 * Clear tinted fragrance: near-full transmission so it reads as see-through
 * rather than dyed resin, and a near-zero roughness so the surface and the
 * meniscus catch a sharp specular. The variant colour arrives as
 * `attenuationColor`, so the tint deepens with the path length through the
 * volume (Beer-Lambert) instead of flattening into a solid fill — the
 * attenuation distance is set just above the interior diameter to keep even the
 * darkest variant legibly transparent.
 */
export const LIQUID_MATERIAL = {
  transmission: 0.94,
  roughness: 0.02,
  metalness: 0,
  ior: 1.37,
  thickness: 0.42,
  attenuationDistance: 1.05,
  specularIntensity: 1,
  envMapIntensity: 1.35,
  transparent: true,
} as const;

export const DIP_TUBE_MATERIAL = {
  color: "#f7f9fa",
  transmission: 0.82,
  roughness: 0.08,
  metalness: 0,
  ior: 1.45,
  thickness: 0.05,
  envMapIntensity: 1.3,
  transparent: true,
} as const;

/**
 * Piano-black moulded plastic for the overcap: a low-roughness base under a
 * tight clearcoat, which is what gives the reference cap its hard, almost
 * mirror-like highlight along the rounded top edge. Metalness stays 0 — it is
 * polished plastic, not metal, so the reflections stay white rather than tinted.
 */
export const CAP_MATERIAL = {
  color: "#08080a",
  roughness: 0.1,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.5,
} as const;

/** Pump hardware inside the neck — darker, less polished than the cap. */
export const PUMP_MATERIAL = {
  color: "#15151a",
  roughness: 0.45,
  metalness: 0.15,
  envMapIntensity: 0.7,
} as const;
