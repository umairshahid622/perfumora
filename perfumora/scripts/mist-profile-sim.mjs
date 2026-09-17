/**
 * Mist profile simulation — screen space.
 *
 * Mirrors the vertex shader in BottleMist.tsx exactly (same closed-form dragged
 * kinematics, same turbulence, same per-particle attribute distributions from
 * generateMistBuffers) and then projects each droplet into screen space through
 * the Ritual yaw, so the numbers can be compared directly against the reference
 * image rather than against the on-axis nominal particle.
 *
 * Reference measurements, as fractions of the 2.4-unit bottle height:
 *   plume length   0.86
 *   cloud diameter 0.585
 *   cloud centre   +0.057 above the nozzle
 *   cloud bottom   -0.236 below the nozzle
 *   screen angle   ~20 deg up from horizontal
 */

// ---- the shipped profile (mirrors MIST_PHYSICS exactly) --------------------
const P = {
  gravity: 1.4,
  drag: 1.1,
  exitVelocity: 5.3,
  elevationAngle: 0.0,
  coneAngle: 0.31,
  burstDuration: 0.46,
  particleLifetime: 0.92,
  count: 4000,
  turbAmpMin: 0.28,
  turbAmpMax: 0.54,
};

const BOTTLE = 2.4;
const YAW = 0.55; // RITUAL_YAW — the tilt group's yaw during the Ritual

// The reference, in scene units
const TARGET = {
  length: 0.86 * BOTTLE,
  cloudDiameter: 0.585 * BOTTLE,
  cloudCentre: 0.057 * BOTTLE,
  cloudBottom: -0.236 * BOTTLE,
};

function mulberry(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(p) {
  const rnd = mulberry(20260917);
  const out = [];

  const sinE = Math.sin(p.elevationAngle);
  const cosE = Math.cos(p.elevationAngle);
  const axis = { x: 0, y: sinE, z: cosE };
  // across = up x axis = (cosE, 0, -sinE); up = axis x across = (0,1,0)... derived
  const across = { x: cosE, y: 0, z: -sinE };
  const up = {
    x: axis.y * across.z - axis.z * across.y,
    y: axis.z * across.x - axis.x * across.z,
    z: axis.x * across.y - axis.y * across.x,
  };

  for (let i = 0; i < p.count; i++) {
    const r = Math.sqrt(rnd());
    const phi = rnd() * Math.PI * 2;
    const theta = r * p.coneAngle;

    const speedRatio = 1.0 - 0.28 * r + (rnd() - 0.5) * 0.22;
    const speed = p.exitVelocity * Math.max(0.65, speedRatio);

    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    let dx = axis.x * cosT + across.x * Math.cos(phi) * sinT + up.x * Math.sin(phi) * sinT;
    let dy = axis.y * cosT + across.y * Math.cos(phi) * sinT + up.y * Math.sin(phi) * sinT;
    let dz = axis.z * cosT + across.z * Math.cos(phi) * sinT + up.z * Math.sin(phi) * sinT;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;

    const vx = dx * speed;
    const vy = dy * speed;
    const vz = dz * speed;

    const birth = Math.pow(rnd(), 1.1) * p.burstDuration;
    const drag = p.drag * (0.85 + rnd() * 0.35);
    const lifetime = p.particleLifetime * (0.85 + rnd() * 0.3);

    const freq = 3.2 + rnd() * 3.5;
    const amp = p.turbAmpMin + rnd() * (p.turbAmpMax - p.turbAmpMin);
    const phaseX = rnd() * Math.PI * 2;
    const phaseY = rnd() * Math.PI * 2;

    // sample the droplet across its life
    for (let s = 0; s <= 10; s++) {
      const tau = (lifetime * s) / 10;
      if (tau <= 0) continue;
      const e = Math.exp(-drag * tau);
      const oneMinusExp = 1 - e;

      let X = (vx / drag) * oneMinusExp;
      let Y = (vy / drag) * oneMinusExp + (-p.gravity / drag) * (tau - oneMinusExp / drag);
      let Z = (vz / drag) * oneMinusExp;

      const turbAmp = amp * oneMinusExp;
      X += Math.sin(tau * freq + phaseX) * turbAmp;
      Y += Math.cos(tau * freq + phaseY) * (turbAmp * 0.5);
      Z += Math.sin(tau * freq * 1.3 + phaseX + 1.57) * (turbAmp * 0.4);

      out.push({ x: X, y: Y, z: Z });
    }
  }

  // Screen space: the tilt group's yaw maps local +X -> world (cosYaw, 0, -sinYaw)
  // and local +Z -> world (sinYaw, 0, cosYaw). The camera is unrotated, so screen
  // x is world x and screen y is world y.
  const cy = Math.cos(YAW);
  const sy = Math.sin(YAW);
  for (const pt of out) {
    const wx = pt.x * cy + pt.z * sy;
    const wy = pt.y;
    pt.sx = wx;
    pt.sy2 = wy;
  }

  return out;
}

function pct(arr, q) {
  const a = [...arr].sort((m, n) => m - n);
  const i = Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))));
  return a[i];
}

const pts = simulate(P);

const sx = pts.map((p) => p.sx);
const sy = pts.map((p) => p.sy2);

const maxX = Math.max(...sx);
const minX = Math.min(...sx);
const maxY = Math.max(...sy);
const minY = Math.min(...sy);
const length = maxX - minX;

// The cloud proper: the far fifth of the plume, sampled there rather than over
// the whole cloud — the near field is the tight cone and would drag every
// percentile toward the nozzle.
const cloudPts = pts.filter((p) => p.sx >= maxX * 0.8);
const cloudY = cloudPts.map((p) => p.sy2);
const cloudTop = pct(cloudY, 0.97);
const cloudBottom = pct(cloudY, 0.03);
const cloudCentre = (cloudTop + cloudBottom) / 2;
const cloudDiameter = cloudTop - cloudBottom;

// Cone edge angles from the orifice, which is what the reference was measured
// from: the steepest and shallowest screen slopes anywhere in the plume.
let upperDeg = -90;
let lowerDeg = 90;
for (const p of pts) {
  if (p.sx < 0.25 || p.sx < maxX * 0.1) continue; // skip the nozzle singularity
  const deg = (Math.atan2(p.sy2, p.sx) * 180) / Math.PI;
  if (deg > upperDeg) upperDeg = deg;
  if (deg < lowerDeg) lowerDeg = deg;
}
const axisDeg = (upperDeg + lowerDeg) / 2;
const halfAngleDeg = (upperDeg - lowerDeg) / 2;

const fmt = (n) => n.toFixed(3);
const rel = (n) => (n / BOTTLE).toFixed(3);
const row = (label, val, target, unit = "x bottle") =>
  console.log(
    label.padEnd(22),
    fmt(val),
    " =",
    rel(val),
    unit,
    "  target",
    rel(target),
  );

console.log("=== simulated plume (screen space) ===");
row("plume length", length, TARGET.length);
row("cloud diameter", cloudDiameter, TARGET.cloudDiameter);
row("cloud centre y", cloudCentre, TARGET.cloudCentre);
row("cloud bottom y", cloudBottom, TARGET.cloudBottom);

// **The angle the eye actually reads.** The Ritual yaw compresses the plume's
// forward travel to `sin(YAW)` of its length, so a local elevation presents on
// screen at atan(tan(elevation) / sin(YAW)) — very nearly double. Reporting the
// local angle here was the mistake that produced the "going too much upwards"
// report: 19.5 deg local is 34 deg on screen.
const apparentAxisDeg =
  (Math.atan(Math.tan(P.elevationAngle) / Math.sin(YAW)) * 180) / Math.PI;
console.log(
  "apparent axis".padEnd(22),
  apparentAxisDeg.toFixed(1),
  "deg   (local elevation",
  ((P.elevationAngle * 180) / Math.PI).toFixed(1),
  "deg)   target <= 20 deg",
);
console.log(
  "cone upper edge".padEnd(22),
  upperDeg.toFixed(1),
  "deg   target 32 deg",
);
console.log(
  "cone lower edge".padEnd(22),
  lowerDeg.toFixed(1),
  "deg   target 7.4 deg",
);
console.log(
  "axis angle".padEnd(22),
  axisDeg.toFixed(1),
  "deg   target 19.7 deg",
);
console.log(
  "cone half-angle".padEnd(22),
  halfAngleDeg.toFixed(1),
  "deg   target 12.3 deg",
);
console.log(
  "full vertical extent".padEnd(22),
  fmt(maxY - minY),
  " =",
  rel(maxY - minY),
  "x bottle   target",
  rel(0.585 * BOTTLE),
);
console.log(
  "fraction below nozzle".padEnd(22),
  ((sy.filter((v) => v < 0).length / sy.length) * 100).toFixed(1),
  "%",
);
