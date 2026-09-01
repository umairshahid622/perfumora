import { CatmullRomCurve3, CubicBezierCurve, Vector2, Vector3 } from "three";

/**
 * Bottle dimensions, in model units where the glass body diameter is exactly
 * 1.0 (radius 0.5). Every value is a ratio read off the supplied reference
 * photograph, so the whole silhouette scales from one number.
 *
 * This module is geometry data only — no materials, no React, no animation.
 * Tune values here and the glass, liquid, dip tube and cap all follow.
 */
export const BOTTLE = {
  /** Straight cylindrical body. */
  bodyRadius: 0.5,
  baseFillet: 0.05,
  /** Thick glass base the liquid sits on top of. */
  baseThickness: 0.14,
  /** Side-wall thickness. */
  wall: 0.045,
  /** Y where the straight wall ends and the shoulder curve begins. */
  straightTop: 1.58,
  /** Y where the shoulder curve lands on the neck. */
  shoulderTop: 1.84,
  neckRadius: 0.262,
  neckWall: 0.055,
  neckTop: 1.9,
  rimFillet: 0.012,
  innerBaseFillet: 0.05,

  /**
   * Black overcap, matching the closure in the reference photograph: a single
   * chunky straight-sided cylinder, wider than tall, with a flat top and one
   * generously rounded top edge. `bottom` is set where the shoulder curve is
   * itself 0.37 wide, so the cap's lower rim seats flush on the glass instead of
   * overhanging it, and the neck and pump disappear up inside.
   */
  cap: {
    bottom: 1.79,
    top: 2.33,
    radius: 0.37,
    topFillet: 0.075,
    bottomFillet: 0.012,
  },
  /** Pump stem: a slim dark shaft tucked up inside the neck bore. */
  pumpBody: { bottom: 1.8, top: 1.88, radius: 0.072 },

  /** Fraction of the interior height that holds fragrance. */
  liquidFill: 0.64,
  dipTubeRadius: 0.015,
} as const;

/** Radius of the cavity the liquid and dip tube live in. */
export const INTERIOR_RADIUS = BOTTLE.bodyRadius - BOTTLE.wall;
/** Radius of the neck bore. */
export const NECK_BORE_RADIUS = BOTTLE.neckRadius - BOTTLE.neckWall;
/** Total height of the assembled bottle, glass base to cap top. */
export const BOTTLE_HEIGHT = BOTTLE.cap.top;

const EPSILON = 1e-4;

/** Sample a circular arc in the profile plane; angles in radians. */
function arc(
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
  segments: number,
): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = from + ((to - from) * i) / segments;
    points.push(
      new Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius),
    );
  }
  return points;
}

/** Sample a cubic bezier in the profile plane. */
function bezier(
  p0: Vector2,
  c1: Vector2,
  c2: Vector2,
  p3: Vector2,
  segments: number,
): Vector2[] {
  return new CubicBezierCurve(p0, c1, c2, p3).getPoints(segments);
}

/** Drop consecutive duplicates so LatheGeometry never gets degenerate faces. */
function dedupe(points: Vector2[]): Vector2[] {
  return points.filter(
    (point, i) => i === 0 || point.distanceTo(points[i - 1]) > EPSILON,
  );
}

const DEG = Math.PI / 180;

/**
 * Half-section of the glass, revolved by LatheGeometry: up the outside from
 * the base centre, over the shoulder, across the rim, then back down the
 * inside to the centre of the base. Because it starts and ends on the axis
 * (x = 0) the revolved surface closes into a solid with real wall thickness,
 * which is what gives the refraction its weight.
 */
export function createGlassProfile(): Vector2[] {
  const {
    bodyRadius,
    baseFillet,
    baseThickness,
    wall,
    straightTop,
    shoulderTop,
    neckRadius,
    neckTop,
    rimFillet,
    innerBaseFillet,
  } = BOTTLE;

  const bore = NECK_BORE_RADIUS;
  const innerWall = bodyRadius - wall;

  return dedupe([
    // Outside: base centre → rounded base edge → straight wall
    new Vector2(0, 0),
    new Vector2(bodyRadius - baseFillet, 0),
    ...arc(bodyRadius - baseFillet, baseFillet, baseFillet, -90 * DEG, 0, 10),
    new Vector2(bodyRadius, straightTop),

    // Shoulder: vertical tangent at the wall, horizontal tangent at the neck
    ...bezier(
      new Vector2(bodyRadius, straightTop),
      new Vector2(bodyRadius, straightTop + 0.145),
      new Vector2(neckRadius + 0.055, shoulderTop),
      new Vector2(neckRadius, shoulderTop),
      26,
    ),

    // Neck and rim
    new Vector2(neckRadius, neckTop - rimFillet),
    ...arc(neckRadius - rimFillet, neckTop - rimFillet, rimFillet, 0, 90 * DEG, 6),
    new Vector2(bore + rimFillet, neckTop),
    ...arc(
      bore + rimFillet,
      neckTop - rimFillet,
      rimFillet,
      90 * DEG,
      180 * DEG,
      6,
    ),

    // Inside: bore → shoulder underside → wall → base
    new Vector2(bore, shoulderTop - 0.02),
    ...bezier(
      new Vector2(bore, shoulderTop - 0.02),
      new Vector2(bore + 0.06, shoulderTop - 0.05),
      new Vector2(innerWall, straightTop - 0.09),
      new Vector2(innerWall, straightTop - 0.03),
      22,
    ),
    new Vector2(innerWall, baseThickness + innerBaseFillet),
    ...arc(
      innerWall - innerBaseFillet,
      baseThickness + innerBaseFillet,
      innerBaseFillet,
      0,
      -90 * DEG,
      10,
    ),
    new Vector2(0, baseThickness),
  ]);
}

/**
 * Fragrance volume: a flat-topped disc that hugs the interior wall. Returned
 * relative to its own origin, so the mesh is positioned at `baseThickness`.
 */
export function createLiquidProfile(fill: number = BOTTLE.liquidFill): Vector2[] {
  const radius = INTERIOR_RADIUS - 0.006;
  const height = (BOTTLE.straightTop - BOTTLE.baseThickness) * fill;

  return [
    new Vector2(0, 0),
    new Vector2(radius, 0),
    new Vector2(radius, height - 0.004),
    new Vector2(radius - 0.004, height),
    new Vector2(0, height),
  ];
}

/** Height of the liquid surface in bottle space, for lighting/glow reuse. */
export function liquidSurfaceY(fill: number = BOTTLE.liquidFill): number {
  return (
    BOTTLE.baseThickness + (BOTTLE.straightTop - BOTTLE.baseThickness) * fill
  );
}

/**
 * The S-curved dip tube in the reference photo: it rises from the base on one
 * side, bows across the centre line, and returns to the pump inlet.
 */
export function createDipTubeCurve(): CatmullRomCurve3 {
  return new CatmullRomCurve3(
    [
      new Vector3(0.17, BOTTLE.baseThickness + 0.03, 0.02),
      new Vector3(0.06, 0.44, 0.02),
      new Vector3(-0.1, 0.8, 0.01),
      new Vector3(-0.05, 1.16, -0.01),
      new Vector3(0.09, 1.48, 0),
      new Vector3(0.03, 1.64, 0),
      new Vector3(0, BOTTLE.pumpBody.bottom + 0.02, 0),
    ],
    false,
    "catmullrom",
    0.5,
  );
}

/**
 * Half-section for a cap part: a straight-sided cylinder, solid to the axis,
 * with independently rounded top and bottom edges. The two radii are separate
 * because the reference cap pairs a broad, soft top edge with a crisp lower rim
 * — a single shared fillet can only give one or the other.
 */
export function createCapProfile(part: {
  bottom: number;
  top: number;
  radius: number;
  topFillet: number;
  bottomFillet: number;
}): Vector2[] {
  const { bottom, top, radius } = part;
  const limit = Math.min((top - bottom) / 2, radius / 2);
  const topFillet = Math.min(part.topFillet, limit);
  const bottomFillet = Math.min(part.bottomFillet, limit);

  return dedupe([
    new Vector2(0, bottom),
    new Vector2(radius - bottomFillet, bottom),
    ...arc(
      radius - bottomFillet,
      bottom + bottomFillet,
      bottomFillet,
      -90 * DEG,
      0,
      6,
    ),
    new Vector2(radius, top - topFillet),
    // Generous segment count: this arc is the cap's signature highlight.
    ...arc(radius - topFillet, top - topFillet, topFillet, 0, 90 * DEG, 16),
    new Vector2(0, top),
  ]);
}
