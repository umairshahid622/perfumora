// TEMPORARY verification script — deleted after use.
// Rasterises the bottle's revolved profile straight from bottle-profile.ts so
// the silhouette can be compared against the reference photograph without a
// browser. No WebGL involved: a lathe's outline IS its profile, mirrored.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import {
  BOTTLE,
  BOTTLE_HEIGHT,
  INTERIOR_RADIUS,
  createCapProfile,
  createDipTubeCurve,
  createGlassProfile,
  createLiquidProfile,
} from "./src/app/_components/three/bottle-profile.ts";

const W = 460;
const H = 940;
const MARGIN = 24;
const scale = Math.min(
  (W - 2 * MARGIN) / (2 * BOTTLE.bodyRadius),
  (H - 2 * MARGIN) / BOTTLE_HEIGHT,
);
const originX = W / 2;
const baseY = H - MARGIN;

const px = (x) => originX + x * scale;
const py = (y) => baseY - y * scale;
const modelY = (row) => (baseY - row) / scale;

const COLORS = {
  bg: [243, 236, 224],
  hollow: [236, 233, 228],
  glass: [176, 182, 186],
  liquid: [184, 115, 51],
  tube: [255, 255, 255],
  cap: [13, 13, 15],
  pump: [30, 30, 36],
  guide: [200, 120, 120],
};

const buf = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  buf[i * 3] = COLORS.bg[0];
  buf[i * 3 + 1] = COLORS.bg[1];
  buf[i * 3 + 2] = COLORS.bg[2];
}

function set(x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
}

/** Radii where a profile polyline crosses the horizontal line y. */
function crossings(points, y) {
  const xs = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y >= hi) continue;
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  return xs;
}

function span(row, fromR, toR, color) {
  const x0 = Math.round(px(-toR));
  const x1 = Math.round(px(toR));
  const inner0 = Math.round(px(-fromR));
  const inner1 = Math.round(px(fromR));
  for (let x = x0; x <= x1; x++) {
    if (fromR > 0 && x > inner0 && x < inner1) continue;
    set(x, row, color);
  }
}

const glass = createGlassProfile();
const liquid = createLiquidProfile();
const capParts = [
  { profile: createCapProfile(BOTTLE.collar), color: COLORS.cap },
  {
    profile: createCapProfile({
      ...BOTTLE.step,
      bottomRadius: BOTTLE.step.radius,
      topRadius: BOTTLE.step.radius,
    }),
    color: COLORS.cap,
  },
  {
    profile: createCapProfile({
      ...BOTTLE.actuator,
      bottomRadius: BOTTLE.actuator.radius,
      topRadius: BOTTLE.actuator.radius,
    }),
    color: COLORS.cap,
  },
  {
    profile: createCapProfile({
      ...BOTTLE.pumpBody,
      bottomRadius: BOTTLE.pumpBody.radius,
      topRadius: BOTTLE.pumpBody.radius,
      edgeFillet: 0.012,
    }),
    color: COLORS.pump,
  },
];

const liquidTop =
  BOTTLE.baseThickness +
  (BOTTLE.straightTop - BOTTLE.baseThickness) * BOTTLE.liquidFill;

for (let row = 0; row < H; row++) {
  const y = modelY(row);
  if (y < -0.01 || y > BOTTLE_HEIGHT + 0.01) continue;

  // Glass: hollow interior, then the wall ring
  const xs = crossings(glass, y);
  if (xs.length) {
    const outer = Math.max(...xs);
    const inner = xs.length > 1 ? Math.min(...xs) : 0;
    span(row, 0, outer, COLORS.hollow);
    span(row, inner, outer, COLORS.glass);
  }

  // Fragrance
  if (y >= BOTTLE.baseThickness && y <= liquidTop) {
    const lxs = crossings(liquid, y - BOTTLE.baseThickness);
    const r = lxs.length ? Math.max(...lxs) : INTERIOR_RADIUS - 0.006;
    span(row, 0, r, COLORS.liquid);
  }
}

// Dip tube: stamp discs along the curve, projected to the profile plane
const curve = createDipTubeCurve();
const tubeR = Math.max(1, Math.round(BOTTLE.dipTubeRadius * scale));
for (let i = 0; i <= 1200; i++) {
  const p = curve.getPoint(i / 1200);
  const cx = Math.round(px(p.x));
  const cy = Math.round(py(p.y));
  for (let dx = -tubeR; dx <= tubeR; dx++) {
    for (let dy = -tubeR; dy <= tubeR; dy++) {
      if (dx * dx + dy * dy <= tubeR * tubeR) set(cx + dx, cy + dy, COLORS.tube);
    }
  }
}

// Cap assembly last: opaque, solid to the axis
for (const part of capParts) {
  for (let row = 0; row < H; row++) {
    const y = modelY(row);
    const xs = crossings(part.profile, y);
    if (!xs.length) continue;
    span(row, 0, Math.max(...xs), part.color);
  }
}

// Thin guide marks: liquid surface and body/shoulder transition
for (const y of [liquidTop, BOTTLE.straightTop]) {
  const row = Math.round(py(y));
  for (let x = 4; x < 22; x++) set(x, row, COLORS.guide);
}

// --- minimal PNG encoder ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 8), data, tail]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = `${process.env.TMPDIR ?? "/tmp"}/bottle-silhouette.png`;
writeFileSync(out, png);
console.log("wrote", out, `${W}x${H}`, "scale px/unit:", scale.toFixed(1));
console.log(
  "aspect (height/body width):",
  (BOTTLE_HEIGHT / (BOTTLE.bodyRadius * 2)).toFixed(3),
  "| cap share of height:",
  ((BOTTLE_HEIGHT - BOTTLE.neckTop) / BOTTLE_HEIGHT).toFixed(3),
);
