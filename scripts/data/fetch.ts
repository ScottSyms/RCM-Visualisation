/**
 * Network access for the ingest pipeline.
 * - Government ArcGIS REST (vector source of record)
 * - Government WMS (capabilities + GetFeatureInfo reference)
 * - CelesTrak public GP data (TLE ephemeris)
 *
 * Security notes (spec 36): timeouts, payload size caps, no execution of
 * remote content; only allowlisted base URLs are constructed by callers.
 */

export interface HttpOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  retries?: number;
}

const UA = 'rcm-mission-visualisation/0.1 (government open data ingest; research use)';

export async function httpGetText(url: string, opts: HttpOptions = {}): Promise<string> {
  const { timeoutMs = 60_000, maxBytes = 200 * 1024 * 1024, headers = {}, retries = 2 } = opts;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, ...headers },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} for ${url} :: ${body.slice(0, 200)}`);
      }
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > maxBytes) throw new Error(`payload too large (${len} bytes) for ${url}`);
      const text = await res.text();
      if (text.length > maxBytes) throw new Error(`payload too large (${text.length}) for ${url}`);
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function httpGetJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  const text = await httpGetText(url, { ...opts, headers: { accept: 'application/json', ...(opts.headers ?? {}) } });
  return JSON.parse(text) as T;
}

/* ------------------------------------------------------------------ */
/* ArcGIS REST MapServer                                               */
/* ------------------------------------------------------------------ */

export interface ArcGisFeature {
  id?: number;
  /** GeoJSON `properties` (ArcGIS REST emits attributes here when f=geojson). */
  properties: Record<string, unknown>;
  geometry?: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | (string & {});
    coordinates: unknown;
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: ArcGisFeature[];
}

export interface ArcGisQueryParams {
  where?: string;
  outFields?: string;
  outSR?: number;
  resultRecordCount?: number;
  start?: number;
  orderByFields?: string;
  returnGeometry?: boolean;
  [k: string]: unknown;
}

export function arcGisQuery(
  mapServerBase: string,
  layerId: number,
  params: ArcGisQueryParams,
): Promise<GeoJsonFeatureCollection> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  q.set('f', 'geojson');
  const url = `${mapServerBase}/${layerId}/query?${q.toString()}`;
  return httpGetJson<GeoJsonFeatureCollection>(url, {
    timeoutMs: 300_000,
    headers: { accept: 'application/geo+json' },
  });
}

/**
 * Fetch every feature in [fromMs, toMs) by bisecting the time axis.
 *
 * Live-server quirks (verified 2026-08-19 against the mission-plan MapServer):
 * - `start`-based paging is silently ignored (even with ORDER BY), so the old
 *   start-offset loop re-fetched the same page forever;
 * - very large single-request pages are rejected by the proxy;
 * - `UTC_STRT` WHERE range filters ISO strings lexicographically (format
 *   `YYYY-MM-DDTHH:MM:SS`, no zone designator), and `outFields=*` returns
 *   every attribute alongside `f=geojson`.
 *
 * Strategy: count the window, then recursively split it; leaf windows
 * (<= PAGE features) come back in a single page. Splits are disjoint
 * ([from, mid) / [mid, to)) so no feature is visited twice.
 */
const PAGE = 5000;
const MIN_SPAN_MS = 6 * 3_600_000;

/** `YYYY-MM-DDTHH:MM:SS` in UTC — identical to the server's UTC_STRT format. */
function isoUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

function timeWhere(fromMs: number, toMs: number): string {
  return `UTC_STRT >= '${isoUtc(fromMs)}' AND UTC_STRT < '${isoUtc(toMs)}'`;
}

export async function arcGisCount(
  mapServerBase: string,
  layerId: number,
  where: string,
): Promise<number> {
  const q = new URLSearchParams({ where, f: 'json', returnCountOnly: 'true' });
  const url = `${mapServerBase}/${layerId}/query?${q.toString()}`;
  const res = await httpGetJson<{ count: number }>(url, { timeoutMs: 120_000 });
  return res.count;
}

export async function arcGisFetchAll(
  mapServerBase: string,
  layerId: number,
  fromMs: number,
  toMs: number,
  onProgress?: (fetched: number, total: number) => void,
): Promise<ArcGisFeature[]> {
  const all: ArcGisFeature[] = [];
  const total = await arcGisCount(mapServerBase, layerId, timeWhere(fromMs, toMs));
  onProgress?.(0, total);

  async function walk(from: number, to: number, count: number): Promise<void> {
    if (count === 0) return;
    if (to - from <= MIN_SPAN_MS || count <= PAGE) {
      let page: GeoJsonFeatureCollection;
      try {
        page = await arcGisQuery(mapServerBase, layerId, {
          where: timeWhere(from, to),
          outFields: '*',
          outSR: 4326,
          resultRecordCount: count,
          returnGeometry: true,
        });
      } catch (err) {
        if (to - from <= MIN_SPAN_MS) throw err;
        const mid = Math.round((from + to) / 2);
        const left = await arcGisCount(mapServerBase, layerId, timeWhere(from, mid));
        await walk(from, mid, left);
        await walk(mid, to, count - left);
        return;
      }
      if (page.features.length !== count && to - from > MIN_SPAN_MS) {
        // The server truncated the page: bisect and fetch the halves.
        const mid = Math.round((from + to) / 2);
        const left = await arcGisCount(mapServerBase, layerId, timeWhere(from, mid));
        await walk(from, mid, left);
        await walk(mid, to, count - left);
        return;
      }
      all.push(...page.features);
      onProgress?.(all.length, total);
      return;
    }
    const mid = Math.round((from + to) / 2);
    const left = await arcGisCount(mapServerBase, layerId, timeWhere(from, mid));
    await walk(from, mid, left);
    await walk(mid, to, count - left);
  }

  await walk(fromMs, toMs, total);
  if (all.length !== total) {
    throw new Error(`ArcGIS fetch incomplete: got ${all.length}/${total} features`);
  }
  return all;
}

/* ------------------------------------------------------------------ */
/* WMS                                                                 */
/* ------------------------------------------------------------------ */

export interface WmsLayerInfo {
  name: string;
  title: string;
  queryable: boolean;
}

export interface WmsCapabilitiesInfo {
  title: string;
  version: string;
  crs: string[];
  infoFormats: string[];
  layers: WmsLayerInfo[];
  fetchedAtUtc: string;
}

/**
 * Minimal capabilities parsing tailored to the known Esri WMS document
 * shape (sufficient for the reference/parity role; the file is also
 * retained in the ingest log).
 */
export function parseWmsCapabilities(xml: string): WmsCapabilitiesInfo {
  const pick = (re: RegExp) => (xml.match(re)?.[1] ?? '').trim();
  const title = pick(/<Title>(?:<!\[CDATA\[)?([^\]<]+)/);
  const version = pick(/<WMS_Capabilities version="([\d.]+)"/);
  const crs = Array.from(xml.matchAll(/<CRS>([^<]+)<\/CRS>/g)).map((m) => m[1].trim());
  const infoFormats = Array.from(
    xml.matchAll(/<GetFeatureInfo>[\s\S]*?<\/GetFeatureInfo>/g),
  )
    .flatMap((block) => Array.from(block[0].matchAll(/<Format>([^<]+)<\/Format>/g)).map((m) => m[1].trim()));
  const layerBlocks = Array.from(xml.matchAll(/<Layer([^>]*)>[\s\S]*?<\/Layer>/g));
  const layers: WmsLayerInfo[] = [];
  for (const block of layerBlocks) {
    const inner = block[0];
    const name = (inner.match(/<Name>([^<]+)<\/Name>/)?.[1] ?? '').trim();
    if (!name) continue;
    const layerTitle = (inner.match(/<Title>(?:<!\[CDATA\[)?([^\]]+?)(?:\]\]>)?(?:<|$)/)?.[1] ?? '').trim();
    const queryable = /queryable="1"/.test(block[1] ?? '');
    if (name && layerTitle) layers.push({ name, title: layerTitle, queryable });
  }
  return {
    title,
    version: version || '1.3.0',
    crs: [...new Set(crs)],
    infoFormats: [...new Set(infoFormats)],
    layers,
    fetchedAtUtc: new Date().toISOString(),
  };
}

export interface WmsFeatureInfoArgs {
  layer: string;
  queryLayers: string;
  bbox: [number, number, number, number]; // minx, miny, maxx, maxy (CRS:84 lon/lat order)
  width: number;
  height: number;
  i: number;
  j: number;
  infoFormat?: string;
  featureCount?: number;
}

export function wmsFeatureInfo(
  wmsBase: string,
  args: WmsFeatureInfoArgs,
): Promise<GeoJsonFeatureCollection> {
  const q = new URLSearchParams();
  q.set('SERVICE', 'WMS');
  q.set('VERSION', '1.3.0');
  q.set('REQUEST', 'GetFeatureInfo');
  q.set('LAYER', args.layer);
  q.set('QUERY_LAYERS', args.queryLayers);
  q.set('I', String(args.i));
  q.set('J', String(args.j));
  q.set('CRS', 'CRS:84');
  q.set('WIDTH', String(args.width));
  q.set('HEIGHT', String(args.height));
  q.set('BBOX', args.bbox.join(','));
  q.set('INFO_FORMAT', args.infoFormat ?? 'application/geojson');
  q.set('FEATURE_COUNT', String(args.featureCount ?? 1));
  const url = `${wmsBase}?${q.toString()}`;
  return httpGetJson<GeoJsonFeatureCollection>(url, { timeoutMs: 120_000 });
}

/* ------------------------------------------------------------------ */
/* CelesTrak (public GP data)                                          */
/* ------------------------------------------------------------------ */

export interface CatalogElement {
  objectName: string;
  intlDesignator: string;
  noradCatId: string;
  epochMs: number;
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  raOfAscNode: number;
  argOfPericenter: number;
  meanAnomaly: number;
  bstar: string;
  meanMotionDot: string;
  meanMotionDdot: string;
  ephemerisType: string;
  classification: string;
  elementSetNo: number;
  revAtEpoch: number;
}

/**
 * Classic TLE column checksum (col 69, 0-indexed 68): sum of digits and the
 * minus sign (value 1) over the first 68 columns, mod 10. Spaces, letters,
 * dots, and other punctuation contribute 0. Verified against live GP lines.
 */
export function tleChecksum(line: string): number {
  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const c = line.charCodeAt(i);
    if (c >= 48 && c <= 57) sum += c - 48; // '0'..'9'
    else if (c === 45) sum += 1; // '-'
  }
  return sum % 10;
}

/**
 * Assemble standard 69-column 3-line TLE text from a CelesTrak catalog
 * elements row. All column spans were verified field-by-field against the
 * live RCM-1 TLE (epoch 2026-08-17, NORAD 44322, from the public GP feed)
 * and against the substring offsets used by satellite.js twoline2satrec.
 *
 * Layout (0-based offsets):
 *   L1  [2:7] satnum [7] class [8:16] intl [18:19] yy [20:31] JJJ.DDDDDDDD
 *       [33:42] ndot (sign + '.' + 8 digits; value = round(v*1e8)/1e8)
 *       [44:51] nddot (sign + 5 digits + exp sign + 1 digit; v = 0.d0000 E -x)
 *       [53:60] bstar (sign + 5 digits + 'E' + sign + 1 digit)
 *       [62] eph type [65:68] element set [68] element number
 *   L2  [2:7] satnum [8:15] inclo [17:24] RAAN [26:32] ecco (7 digits of frac)
 *       [34:41] argp [43:50] M [52:62] mean motion (reps/day, 11 chars)
 *       [63:68] revolutions at epoch
 */
export function buildTle(el: CatalogElement): { name: string; line1: string; line2: string } {
  const satnum = String(parseInt(el.noradCatId, 10)).padStart(5);
  const intl = el.intlDesignator
    .replace(/^(\d{4})-(\d{3})([A-Z])$/, (m, a, b, c) => `${a.slice(2)}${b}${c}`)
    .padEnd(6, ' ');

  const d = new Date(el.epochMs);
  const yy = String(d.getUTCFullYear()).slice(2);
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayFloat = 1 + (el.epochMs - startOfYear) / 86400000; // 1 at Jan 1 00:00Z
  const dayInt = Math.floor(dayFloat);
  const frac8 = (dayFloat - dayInt).toFixed(8).slice(2);

  // ndot: sign + '.' + 8 digits; the value occupies 0.xxxxxxxx of a 1e-8 grid
  const ndotVal = Number(el.meanMotionDot.replace(/[eE]/, 'e')) || 0;
  const ndotInt = Math.round(Math.abs(ndotVal) * 1e8);
  const ndot = `${ndotVal < 0 ? '-' : ' '}.${String(ndotInt).padStart(8, '0')}`;

  // nddot: sign (1) + 5-digit fraction (5) + exp sign (1) + exp digit (1); v = 0.fffff * 10^exp
  const nddotVal = Number(el.meanMotionDdot) || 0;
  const nddotAbs = Math.abs(nddotVal);
  let nddot = ' 00000+0';
  if (nddotAbs >= 1e-10) {
    const E = Math.ceil(Math.log10(nddotAbs * 10)) - 1;
    const m5 = String(Math.min(99999, Math.max(10000, Math.round(nddotAbs * 1e5 / Math.pow(10, E))))).padStart(5, '0');
    nddot = `${nddotVal < 0 ? '-' : ' '}${m5}${E >= 0 ? '+' : '-'}${Math.abs(E)}`;
  }

  // bstar: sign (1) + 5-digit fraction (5) + exp sign (1) + exp digit (1); v = 0.fffff * 10^exp
  const bstarSigned = parseFloat(el.bstar) || 0;
  const bAbs = Math.abs(bstarSigned);
  let bstar = ' 00000+0';
  if (bAbs > 1e-10) {
    const E = Math.ceil(Math.log10(bAbs * 10)) - 1;
    const m5 = String(Math.min(99999, Math.max(10000, Math.round(bAbs * 1e5 / Math.pow(10, E))))).padStart(5, '0');
    bstar = `${bstarSigned < 0 ? '-' : ' '}${m5}${E >= 0 ? '+' : '-'}${Math.abs(E)}`;
  }

  const l1 =
    '1 ' + satnum + (el.classification || 'U') +
    ' ' + intl + '   ' + yy + String(Math.min(365, dayInt)).padStart(3) + '.' + frac8 +
    ' ' + ndot +
    ' ' + nddot +
    ' ' + bstar +
    ' ' + (el.ephemerisType || '0') + '  999';

  const ecc = String(Math.round(el.eccentricity * 1e7)).padStart(7, '0');
  const l2 =
    '2 ' + satnum + ' ' +
    el.inclination.toFixed(4).padStart(8) +
    ' ' + el.raOfAscNode.toFixed(4).padStart(8) +
    ' ' + ecc +
    ' ' + el.argOfPericenter.toFixed(4).padStart(8) +
    ' ' + el.meanAnomaly.toFixed(4).padStart(8) +
    ' ' + el.meanMotion.toFixed(8).padStart(11) +
    String(Math.abs(el.revAtEpoch) % 100000).padStart(5, '0');

  return {
    name: el.objectName,
    line1: l1.slice(0, 68) + String(tleChecksum(l1)),
    line2: l2.slice(0, 68) + String(tleChecksum(l2)),
  };
}

/**
 * Parse an ISO-8601 timestamp as UTC -> ms since epoch. CelesTrak omits the
 * zone designator (e.g. `2026-08-18T15:22:15.647232`), so a bare `Date.parse`
 * would interpret it in the *local* timezone and shift the ephemeris epoch by
 * the machine's UTC offset. Coerce a missing zone to `Z`; pass through strings
 * that already carry one.
 */
export function parseUtcMs(s: string): number {
  const t = s.trim();
  if (t === '') throw new Error('empty timestamp');
  if (/(?:[zZ])|(?:[+-]\d{2}:?\d{2})$/.test(t)) return Date.parse(t);
  const ms = Date.parse(t + 'Z');
  if (Number.isNaN(ms)) throw new Error(`unparseable UTC timestamp: ${s}`);
  return ms;
}

/** Parse a CelesTrak catalog-elements CSV response (header + row) into the element model. */
export function parseCelestrakRows(csv: string, rows: unknown[] = []): CatalogElement[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2 || !lines[0].startsWith('OBJECT_NAME')) {
    throw new Error('unexpected CelesTrak response shape (expected CSV with OBJECT_NAME header)');
  }
  const header = lines[0].split(',').map((s) => s.trim());
  const out: CatalogElement[] = lines.slice(1).map((line) => {
    const cols = line.split(',').map((s) => s.trim());
    const get = (name: string): string => {
      const idx = header.indexOf(name);
      return idx >= 0 ? cols[idx] ?? '' : '';
    };
    return {
      objectName: get('OBJECT_NAME'),
      intlDesignator: get('OBJECT_ID'),
      noradCatId: get('NORAD_CAT_ID'),
      epochMs: parseUtcMs(get('EPOCH')),
      meanMotion: Number(get('MEAN_MOTION')),
      eccentricity: Number(get('ECCENTRICITY')),
      inclination: Number(get('INCLINATION')),
      raOfAscNode: Number(get('RA_OF_ASC_NODE')),
      argOfPericenter: Number(get('ARG_OF_PERICENTER')),
      meanAnomaly: Number(get('MEAN_ANOMALY')),
      bstar: get('BSTAR'),
      meanMotionDot: get('MEAN_MOTION_DOT'),
      meanMotionDdot: get('MEAN_MOTION_DDOT'),
      ephemerisType: get('EPHEMERIS_TYPE'),
      classification: get('CLASSIFICATION_TYPE'),
      elementSetNo: Number(get('ELEMENT_SET_NO') || 999),
      revAtEpoch: Number(get('REV_AT_EPOCH') || 0),
    };
  });
  out.push(...(rows as CatalogElement[]));
  return out;
}

export function celestrakGpUrl(catnr: number | string): string {
  return `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&SFORMAT=tle`;
}
