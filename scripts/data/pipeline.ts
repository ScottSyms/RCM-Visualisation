import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { arcGisFetchAll, buildTle, httpGetText, parseCelestrakRows } from './fetch.ts';
import { CELESTRAK, GOV, INGEST } from './constants.ts';
import { normalizeFeature } from './normalize.ts';
import { buildEphemerisPackage, buildSamplers } from './ephemeris.ts';
import type { Acquisition, Satellite } from './model.ts';

// Trailing slash: write() resolves each filename against this URL.
const OUT_DIR = new URL('../../public/data/', import.meta.url);

function log(msg: string): void {
  console.log(`[rcm:ingest] ${msg}`);
}

export async function fetchCatalog(): Promise<Satellite[]> {
  const sats: Satellite[] = [];
  for (const { name, catnr } of CELESTRAK.satellites) {
    const url = `${CELESTRAK.baseUrl}?CATNR=${catnr}&FORMAT=csv`;
    const csv = await httpGetText(url, { timeoutMs: INGEST.resources.timeoutMs });
    const rows = parseCelestrakRows(csv);
    const el = rows[0];
    if (!el) throw new Error(`no element row returned for ${name} (CATNR ${catnr})`);
    if (el.objectName !== name) log(`warning: ${name} catalog returned OBJECT_NAME=${el.objectName}`);
    const tle = buildTle(el);
    sats.push({
      norad: catnr,
      name,
      intl: el.intlDesignator,
      epochMs: el.epochMs,
      tle: { line1: tle.line1, line2: tle.line2 },
    });
    log(`catalog ${name} (NORAD ${catnr}) epoch ${new Date(el.epochMs).toISOString()}`);
  }
  return sats;
}

function windowOf(acqs: Acquisition[]): { startMs: number | null; endMs: number | null } {
  if (acqs.length === 0) return { startMs: null, endMs: null };
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const a of acqs) {
    if (a.startMs < startMs) startMs = a.startMs;
    if (a.endMs > endMs) endMs = a.endMs;
  }
  return { startMs, endMs };
}

export async function run(): Promise<void> {
  const startedAt = Date.now();
  log('fetching satellite catalog (CelesTrak)…');
  const satellites = await fetchCatalog();

  // Time-bounded fetch windows (UTC_STRT is the layer's start-time attribute).
  // The server ignores `start` paging, so the fetcher bisects these ranges.
  const DAY = 86_400_000;
  const nowMs = Date.now();

  log('fetching planned acquisitions (ArcGIS REST layer 0)…');
  const plannedF = await arcGisFetchAll(
    GOV.mapServer,
    GOV.plannedLayer,
    nowMs - 7 * DAY,
    nowMs + 120 * DAY,
    (got, tot) => log(`  planned: ${got}/${tot} features`),
  );
  log('fetching past acquisitions (ArcGIS REST layer 1)…');
  const pastF = await arcGisFetchAll(
    GOV.mapServer,
    GOV.pastLayer,
    nowMs - 200 * DAY,
    nowMs + 7 * DAY,
    (got, tot) => log(`  past: ${got}/${tot} features`),
  );

  const planned = plannedF
    .map((f, i) => normalizeFeature(f, 'planned', i))
    .filter((a): a is Acquisition => a != null);
  const past = pastF
    .map((f, i) => normalizeFeature(f, 'past', i))
    .filter((a): a is Acquisition => a != null);
  log(`normalized planned=${planned.length} past=${past.length}`);

  // Ephemeris raw-sample package over the planned (active) window.
  const pw = windowOf(planned);
  const all = { ...windowOf([...planned, ...past]) };
  const ephT0 = pw.startMs ?? all.startMs ?? Date.now();
  const ephT1 = pw.endMs ?? all.endMs ?? Date.now() + 86_400_000;
  const samplers = buildSamplers(satellites);
  const ephemeris = buildEphemerisPackage(samplers, ephT0, ephT1, INGEST.ephemerisStepMs, 200_000);

  const clockSeedMs = planned.length > 0 ? pw.startMs! - INGEST.clockPreRollMs : null;

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: { arcgis: GOV.mapServer, celestrak: CELESTRAK.baseUrl },
    window: { startMs: all.startMs ?? 0, endMs: all.endMs ?? 0 },
    past: { count: past.length, ...windowOf(past) },
    planned: { count: planned.length, ...windowOf(planned) },
    clockSeedMs,
    satellites: satellites.map(({ norad, name, intl, epochMs }) => ({ norad, name, intl, epochMs })),
    ephemeris: { stepMs: INGEST.ephemerisStepMs, startMs: ephT0, endMs: ephT1 },
  };

  // Start from a clean directory so a stale file from a previous (possibly buggy)
  // run can't feed the app an oversized or inconsistent dataset.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, obj: unknown) => {
    const text = JSON.stringify(obj);
    writeFileSync(new URL(name, OUT_DIR), text);
    log(`wrote ${name} (${text.length} bytes)`);
  };
  write('manifest.json', manifest);
  write('satellites.json', satellites);
  write('planned.json', planned);
  // The browser only needs centroid dots. Do not publish the full historical
  // footprint archive: it exceeds static-host per-file limits and is unused.
  write(
    'past.points.json',
    past.map((a) => ({ sat: a.satid, startMs: a.startMs, endMs: a.endMs, centroid: a.centroid })),
  );
  write('ephemeris.json', ephemeris);

  log(`done in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
}
