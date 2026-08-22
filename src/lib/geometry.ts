/**
 * Shared geodetic/planar geometry used by the ingest pipeline (Node) and the
 * browser slice worker. Pure math only — no framework dependencies.
 *
 * Conventions:
 * - Vec3 is [x, y, z]; ECEF/ECI metres; lon/lat in degrees unless noted.
 * - ENU: east / north / up in the local tangent plane at a reference origin.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type LonLat = [number, number]; // degrees, [lon, lat]

export const WGS84 = {
  a: 6378137, // metres
  f: 1 / 298.257223563,
  e2: 0.00669437999014, // first eccentricity squared
};

const DEG = Math.PI / 180;
const D2R = (d: number): number => d * DEG;

export function radToDeg(r: number): number {
  return r / DEG;
}
export function degToRad(d: number): number {
  return d * DEG;
}

/* ------------------------------------------------------------------ */
/* ECEF <-> geodetic                                                   */
/* ------------------------------------------------------------------ */

export function geodeticToEcef(lonDeg: number, latDeg: number, h = 0): Vec3 {
  const lon = D2R(lonDeg);
  const lat = D2R(latDeg);
  const { a, e2 } = WGS84;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const x = (N + h) * cosLat * Math.cos(lon);
  const y = (N + h) * cosLat * Math.sin(lon);
  const z = (N * (1 - e2) + h) * sinLat;
  return [x, y, z];
}

/**
 * ECEF metres -> geodetic (lon, lat in degrees, h metres).
 * Fein (1994) closed-form seed refined with short iterative polish;
 * accuracy well below a metre for this application.
 */
export function ecefToGeodetic(p: Vec3): { lon: number; lat: number; h: number } {
  const a = WGS84.a;
  const f = WGS84.f;
  const b = a * (1 - f);
  const e2 = (a * a - b * b) / (a * a);
  const ep2 = e2 / (1 - e2);
  const [x, y, z] = p;

  const lon = Math.atan2(y, x);
  const L = Math.hypot(x, y);
  if (L < 1e-9) {
    // polar point
    const sinLat = z > 0 ? 1 : -1;
    return { lon: radToDeg(x >= 0 ? 0 : Math.PI), lat: z > 0 ? 90 : -90, h: Math.abs(z) - b };
  }
  const theta = Math.atan2(z * (1 + ep2), L);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  let lat = Math.atan2(z + ep2 * b * st ** 3, L - e2 * a * ct ** 3);
  let h = L / Math.cos(lat) - a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);

  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    if (Math.abs(cosLat) < 1e-10 || Math.abs(sinLat) < 1e-10) break;
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    h = L / cosLat - N;
    lat = Math.atan2(z, (L * (1 - e2 * (N / (N + h)))));
  }
  return { lon: radToDeg(lon), lat: radToDeg(lat), h };
}

/* ------------------------------------------------------------------ */
/* Local ENU frames                                                    */
/* ------------------------------------------------------------------ */

export interface EnuFrame {
  origin: { lon: number; lat: number };
  /** unit vectors, ECEF components */
  E: Vec3;
  N: Vec3;
  U: Vec3;
}

export function enuFrame(origin: LonLat): EnuFrame {
  const lon = D2R(origin[0]);
  const lat = D2R(origin[1]);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  return {
    origin: { lon: origin[0], lat: origin[1] },
    E: [-sinLon, cosLon, 0],
    N: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    U: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

export function enuToEcef(p: Vec3, frame: EnuFrame): Vec3 {
  const o = geodeticToEcef(frame.origin.lon, frame.origin.lat);
  return [
    o[0] + p[0] * frame.E[0] + p[1] * frame.N[0] + p[2] * frame.U[0],
    o[1] + p[0] * frame.E[1] + p[1] * frame.N[1] + p[2] * frame.U[1],
    o[2] + p[0] * frame.E[2] + p[1] * frame.N[2] + p[2] * frame.U[2],
  ];
}

export function ecefToEnu(vec: Vec3, frame: EnuFrame): Vec3 {
  const o = geodeticToEcef(frame.origin.lon, frame.origin.lat);
  const dx = vec[0] - o[0];
  const dy = vec[1] - o[1];
  const dz = vec[2] - o[2];
  return [
    dx * frame.E[0] + dy * frame.E[1] + dz * frame.E[2],
    dx * frame.N[0] + dy * frame.N[1] + dz * frame.N[2],
    dx * frame.U[0] + dy * frame.U[1] + dz * frame.U[2],
  ];
}

/* ------------------------------------------------------------------ */
/* Earth rotation                                                      */
/* ------------------------------------------------------------------ */

/** Julian date from unix milliseconds (UTC). */
export function julianDate(tMs: number): number {
  return tMs / 86400000 + 2440587.5;
}

/**
 * Greenwich Mean Sidereal Time (radians), IAU 1982 (<0.01s accuracy).
 */
export function gmstRad(tMs: number): number {
  const jd = julianDate(tMs);
  const T = (jd - 2451545.0) / 36525;
  const gmstDeg =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T;
  let deg = gmstDeg % 360;
  if (deg < 0) deg += 360;
  return D2R(deg);
}

/** Rotate an ECI (J2000-equator convention) vector to ECEF using the GMST at t. */
export function eciToEcefAt(v: Vec3, tMs: number): Vec3 {
  const g = gmstRad(tMs);
  const c = Math.cos(g);
  const s = Math.sin(g);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
}

/* ------------------------------------------------------------------ */
/* Vec helpers                                                         */
/* ------------------------------------------------------------------ */

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  normalize: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

/* ------------------------------------------------------------------ */
/* Polygon utilities                                                   */
/* ------------------------------------------------------------------ */

/**
 * True when any consecutive vertex pair jumps more than 180 degrees of
 * longitude, i.e. the ring crosses the antimeridian.
 */
export function crossesAntimeridian(ring: LonLat[]): boolean {
  for (let i = 0; i + 1 < ring.length; i++) {
    if (Math.abs(ring[i + 1][0] - ring[i][0]) > 180) return true;
  }
  return false;
}

/** Wrap a degree difference to [-180, 180). */
function wrapDeg(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

/**
 * Split a closed ring that crosses the antimeridian into one or more closed
 * rings clipped at +/-180, so each side of the date line renders without
 * wrap artifacts. Non-crossing rings pass through unchanged.
 *
 * The ring is walked in a continuous (unwrapped) longitude space where every
 * consecutive step stays within 180 degrees and date-line crossings appear
 * as edges spanning a multiple of 180. Each output segment is then normalized
 * independently back into the [-180, 180] range.
 */
export function splitRingAtAntimeridian(ring: LonLat[]): LonLat[][] {
  if (!crossesAntimeridian(ring)) return [ring.slice(0)];
  const closed =
    ring.length > 1 &&
    Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-9 &&
    Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-9;
  const open = closed ? ring.slice(0, -1) : ring.slice(0);
  if (open.length < 3) return [ring.slice(0)];

  // 1) walk vertices in continuous longitude space (minimal steps)
  const verts: { lon: number; lat: number }[] = [];
  for (let i = 0; i < open.length; i++) {
    if (verts.length === 0) {
      verts.push({ lon: open[i][0], lat: open[i][1] });
    } else {
      const d = wrapDeg(open[i][0] - verts[i - 1].lon);
      verts.push({ lon: verts[i - 1].lon + d, lat: open[i][1] });
    }
  }
  // closing edge: vertex 0 in the continuous branch reached from the last vertex
  const firstLonOpen = verts[verts.length - 1].lon + wrapDeg(open[0][0] - verts[verts.length - 1].lon);

  // 2) walk edges; cut at odd multiples of 180
  const segs: { lon: number; lat: number }[][] = [];
  let cur: { lon: number; lat: number }[] = [];
  const push = (lon: number, lat: number) => {
    const last = cur[cur.length - 1];
    if (last && Math.abs(lon - last.lon) < 1e-11 && Math.abs(lat - last.lat) < 1e-11) return;
    cur.push({ lon, lat });
  };
  const endSeg = () => {
    if (cur.length) segs.push(cur);
    cur = [];
  };

  // An odd multiple of 180 strictly inside (lo, hi), or null. Consecutive
  // steps are <=180 deg, so at most one such boundary lies on any edge.
  const edgeCrossing = (a: number, b: number): number | null => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 1e-9) return null;
    const loU = lo / 180; // in units of 180 degrees
    const hiU = hi / 180;
    const m0 = Math.ceil(loU - 1e-12); // smallest integer >= loU
    for (let m = m0 - 1; m <= m0 + 1; m++) {
      if (Math.abs(m) % 2 === 1 && m > loU + 1e-9 && m < hiU - 1e-9) return 180 * m;
    }
    return null;
  };

  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    const w = i + 1 < n ? verts[i + 1] : { lon: firstLonOpen, lat: open[0][1] };
    push(v.lon, v.lat);
    const xs = edgeCrossing(v.lon, w.lon);
    if (xs !== null) {
      const f = (xs - v.lon) / (w.lon - v.lon);
      const lat = v.lat + (w.lat - v.lat) * f;
      push(xs, lat);
      endSeg();
      cur.push({ lon: xs, lat });
    }
  }
  // closing vertex (branch of vertex 0) + tail
  push(firstLonOpen, open[0][1]);
  endSeg();

  // 3) merge the tail segment onto the head (they share the vertex-0 point)
  if (segs.length > 1) {
    const head = segs[0];
    const tail = segs[segs.length - 1];
    const tailLast = tail[tail.length - 1];
    const headFirst = head[0];
    const shared =
      Math.abs(wrapDeg(tailLast.lon - headFirst.lon)) < 1e-6 &&
      Math.abs(tailLast.lat - headFirst.lat) < 1e-6;
    if (shared) {
      segs[0] = [...tail.slice(0, -1), ...head];
      segs.pop();
    }
  }

  // 4) normalize each segment back to the [-180, 180] range, close rings.
  //    Use a uniform 360-degree offset per segment so a half that sits just
  //    west/east of the line stays on one side instead of straddling +/-180.
  const out: LonLat[][] = [];
  for (const seg of segs) {
    if (seg.length < 3) continue;
    const firstLon = seg[0].lon;
    const shifted = seg.map((p) => firstLon + wrapDeg(p.lon - firstLon));
    const sMin = Math.min(...shifted);
    const sMax = Math.max(...shifted);
    const K = Math.round(-(sMin + sMax) / (2 * 360)); // centers the segment near 0
    const norm = seg.map((p, i) => [shifted[i] + 360 * K, p.lat] as LonLat);
    const deduped: LonLat[] = [];
    for (const p of norm) {
      const last = deduped[deduped.length - 1];
      if (!last || Math.abs(p[0] - last[0]) > 1e-9 || Math.abs(p[1] - last[1]) > 1e-9) deduped.push(p);
    }
    if (deduped.length >= 2) {
      const same = (a: LonLat, b: LonLat) =>
        Math.abs(wrapDeg(a[0] - b[0])) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
      if (!same(deduped[0], deduped[deduped.length - 1])) deduped.push(deduped[0]);
    }
    if (deduped.length >= 3) out.push(deduped);
  }
  return out.length ? out : [ring.slice(0)];
}

/**
 * Area-weighted 2D centroid of a ring (degrees, planar approximation —
 * sufficient for fly-to targets and cards at strip scale).
 */
export function ringCentroid(ring: LonLat[]): LonLat {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    // degenerate (line): midpoint of the ring
    const m = Math.floor(ring.length / 2);
    return ring[m];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * Sutherland-Hodgman clip of a (simple, possibly concave) 2D polygon
 * against an axis-aligned rectangle. Returns null when empty/degenerate.
 */
export function clipPolyToRect(
  poly: Vec2[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Vec2[] | null {
  const clip = (pts: Vec2[], keepSign: 1 | -1, axis: 0 | 1, bound: number): Vec2[] => {
    const res: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const da = (axis === 0 ? a[0] : a[1]) - bound;
      const db = (axis === 0 ? b[0] : b[1]) - bound;
      const aIn = keepSign === 1 ? da >= 0 : da <= 0;
      const bIn = keepSign === 1 ? db >= 0 : db <= 0;
      if (aIn) res.push(a);
      if (aIn !== bIn) {
        const t = da / (da - db);
        res.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return res;
  };
  let out = clip(poly, 1, 0, x0);
  if (out.length < 3) return null;
  out = clip(out, -1, 0, x1);
  if (out.length < 3) return null;
  out = clip(out, 1, 1, y0);
  if (out.length < 3) return null;
  out = clip(out, -1, 1, y1);
  return out.length >= 3 ? out : null;
}

/* ------------------------------------------------------------------ */
/* Acquisition slice model (spec 10.3)                                 */
/* ------------------------------------------------------------------ */

export interface SliceParams {
  /** geodetic origin of the tangent plane [lon, lat] degrees */
  origin: LonLat;
  /** along-track unit axis in ENU components (0..1 east, north) */
  axis: Vec2;
  /** signed along-track distances, metres */
  tMin: number;
  tMax: number;
  /** signed cross-track distances, metres */
  cMin: number;
  cMax: number;
  /** recommended slice count */
  n: number;
}

/** Plane basis at origin derived from the along-track axis (unit along-track ECEF dir). */
function planeBasis(origin: LonLat, axis: Vec2): { aEcef: Vec3; cEcef: Vec3 } {
  const frame = enuFrame(origin);
  // along-track direction in ECEF = axis0*east + axis1*north (the ENU offset
  // IS the direction; do NOT add the origin position).
  const aEcef = v3.normalize(v3.add(v3.scale(frame.E, axis[0]), v3.scale(frame.N, axis[1])));
  const cEcef = v3.normalize(v3.cross(frame.U, aEcef)); // left of travel
  return { aEcef, cEcef };
}

/**
 * Project a lon/lat ring into plane coordinates (metres):
 *   x = signed along-track distance, y = signed cross-track distance.
 */
export function projectRing(ring: LonLat[], origin: LonLat, axis: Vec2): Vec2[] {
  const { aEcef, cEcef } = planeBasis(origin, axis);
  const originEcef = geodeticToEcef(origin[0], origin[1]);
  return ring.map(([lon, lat]) => {
    const d = v3.sub(geodeticToEcef(lon, lat, 0), originEcef);
    return [v3.dot(d, aEcef), v3.dot(d, cEcef)];
  });
}

/** Inverse of projectRing. */
export function projectPoint(p: Vec2, origin: LonLat, axis: Vec2): LonLat {
  const { aEcef, cEcef } = planeBasis(origin, axis);
  const ecef = v3.add(
    geodeticToEcef(origin[0], origin[1]),
    v3.add(v3.scale(aEcef, p[0]), v3.scale(cEcef, p[1])),
  );
  const g = ecefToGeodetic(ecef);
  return [g.lon, g.lat];
}

export interface RingExtent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function ringExtent(poly: Vec2[]): RingExtent {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * Divide an acquisition footprint into ordered progress slices (spec 10.3):
 * project ring(s) to the tangent plane, band them perpendicular to the
 * along-track axis, clip, project back to lon/lat.
 */
export function computeSlices(
  rings: LonLat[][] | null,
  origin: LonLat,
  axis: Vec2,
  n: number,
): { slices: LonLat[][]; params: SliceParams } | null {
  if (!rings || rings.length === 0) return null;
  const polys = rings.map((r) => projectRing(r, origin, axis));
  const extents = polys.map(ringExtent);
  const x0 = Math.min(...extents.map((e) => e.x0));
  const x1 = Math.max(...extents.map((e) => e.x1));
  const y0 = Math.min(...extents.map((e) => e.y0));
  const y1 = Math.max(...extents.map((e) => e.y1));
  if (!(x1 > x0) || !(y1 > y0)) return null;
  const ew = x1 - x0;
  const yPad = 1e-6;
  const slices: LonLat[][] = [];
  for (let i = 0; i < n; i++) {
    const sa = x0 + (ew * i) / n - 1e-6;
    const sb = x0 + (ew * (i + 1)) / n + 1e-6;
    for (const poly of polys) {
      const clipped = clipPolyToRect(poly, sa, y0 - yPad, sb, y1 + yPad);
      if (!clipped) continue;
      const ring: LonLat[] = clipped.map((q) => projectPoint(q, origin, axis));
      ring.push(ring[0]);
      slices.push(ring);
    }
  }
  const params: SliceParams = {
    origin,
    axis,
    tMin: x0,
    tMax: x1,
    cMin: y0,
    cMax: y1,
    n,
  };
  return { slices, params };
}

/**
 * Signed cross-track offset of `point` from the along-track axis through
 * `origin` (metres; positive = left of travel direction).
 */
export function signedCrossTrack(origin: LonLat, point: LonLat, axis: Vec2): number {
  const { cEcef } = planeBasis(origin, axis);
  const d = v3.sub(geodeticToEcef(point[0], point[1], 0), geodeticToEcef(origin[0], origin[1], 0));
  return v3.dot(d, cEcef);
}
