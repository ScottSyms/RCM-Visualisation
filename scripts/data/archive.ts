/**
 * Persistent, deduplicated acquisition archive backed by Cloudflare D1.
 *
 * The government ArcGIS service only serves a rolling window (see the
 * fetch bounds in pipeline.ts) — nothing outside that window persists on
 * their side, and pipeline.ts used to wipe and fully rebuild `public/data/`
 * on every run. This module upserts every normalized record into D1 keyed
 * by the stable `Acquisition.id` (`${kind}-${OBJECTID}`), so:
 *   - records that scroll out of the source's serving window stay in our
 *     own history instead of disappearing on the next build;
 *   - re-fetching a record whose attributes changed (e.g. a revised
 *     planned time) updates it in place rather than duplicating it.
 *
 * Optional by design: with CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_API_TOKEN
 * unset (e.g. local dev without Cloudflare credentials), every function
 * here is a no-op and the pipeline falls back to publishing only the
 * freshly fetched window, matching pre-archive behaviour.
 */
import type { Acquisition } from './model.ts';

const D1_ENDPOINT_BASE = 'https://api.cloudflare.com/client/v4/accounts';
// D1 caps bound parameters at 100 per statement; each upsert row binds 16,
// so statements never need splitting. This only chunks the *batch* (how
// many single-row statements ride in one HTTP call) to keep request bodies
// and D1's per-batch work reasonable.
const BATCH_STATEMENTS = 400;

export interface D1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export function loadD1ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): D1Config | null {
  const accountId = env.CF_ACCOUNT_ID;
  const databaseId = env.CF_D1_DATABASE_ID;
  const apiToken = env.CF_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
}

interface D1StatementResult {
  success: boolean;
  results?: Record<string, unknown>[];
  meta?: { changes?: number };
}
interface D1Response {
  success: boolean;
  result: D1StatementResult[];
  errors: Array<{ code: number; message: string }>;
}

async function d1Batch(
  cfg: D1Config,
  statements: Array<{ sql: string; params: unknown[] }>,
): Promise<D1Response> {
  const url = `${D1_ENDPOINT_BASE}/${cfg.accountId}/d1/database/${cfg.databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiToken}` },
    body: JSON.stringify(statements.length === 1 ? statements[0] : { batch: statements }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json()) as D1Response;
  if (!res.ok || !body.success) {
    throw new Error(`D1 query failed (HTTP ${res.status}): ${JSON.stringify(body.errors ?? body)}`);
  }
  return body;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function upsertStatement(a: Acquisition, updatedAt: number): { sql: string; params: unknown[] } {
  const sql = `
    INSERT INTO acquisitions
      (id, kind, satid, beam, beamId, pol, polType, ccd, product, radarMode, startMs, endMs, footprint, centroidLon, centroidLat, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind, satid = excluded.satid, beam = excluded.beam, beamId = excluded.beamId,
      pol = excluded.pol, polType = excluded.polType, ccd = excluded.ccd, product = excluded.product,
      radarMode = excluded.radarMode, startMs = excluded.startMs, endMs = excluded.endMs,
      footprint = excluded.footprint, centroidLon = excluded.centroidLon, centroidLat = excluded.centroidLat,
      updatedAt = excluded.updatedAt;
  `;
  const params = [
    a.id, a.kind, a.satid, a.beam, a.beamId, a.pol, a.polType, a.ccd, a.product, a.radarMode,
    a.startMs, a.endMs, JSON.stringify(a.footprint), a.centroid?.[0] ?? null, a.centroid?.[1] ?? null, updatedAt,
  ];
  return { sql, params };
}

/** Merge (upsert, deduped by id) every acquisition into the D1 archive. No-op if D1 isn't configured. */
export async function archiveUpsert(
  cfg: D1Config | null,
  acquisitions: Acquisition[],
  log: (msg: string) => void,
): Promise<void> {
  if (!cfg) {
    log('D1 archive not configured (CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_API_TOKEN unset) — skipping archive merge');
    return;
  }
  if (acquisitions.length === 0) return;
  const now = Date.now();
  const statements = acquisitions.map((a) => upsertStatement(a, now));
  let changed = 0;
  for (const batch of chunk(statements, BATCH_STATEMENTS)) {
    const res = await d1Batch(cfg, batch);
    changed += res.result.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }
  log(`archive: merged ${acquisitions.length} records into D1 (${changed} rows changed)`);
}

/** Read back archived acquisitions of `kind` whose window overlaps [fromMs, toMs). Empty if D1 isn't configured. */
export async function archiveQueryWindow(
  cfg: D1Config | null,
  kind: Acquisition['kind'],
  fromMs: number,
  toMs: number,
): Promise<Acquisition[]> {
  if (!cfg) return [];
  const res = await d1Batch(cfg, [
    {
      sql: `SELECT * FROM acquisitions WHERE kind = ? AND endMs >= ? AND startMs < ? ORDER BY startMs ASC;`,
      params: [kind, fromMs, toMs],
    },
  ]);
  const rows = res.result[0]?.results ?? [];
  return rows.map(rowToAcquisition);
}

export function rowToAcquisition(r: Record<string, unknown>): Acquisition {
  return {
    id: String(r.id),
    kind: r.kind as Acquisition['kind'],
    satid: String(r.satid ?? ''),
    beam: String(r.beam ?? ''),
    beamId: String(r.beamId ?? ''),
    pol: String(r.pol ?? ''),
    polType: String(r.polType ?? ''),
    ccd: String(r.ccd ?? ''),
    product: String(r.product ?? ''),
    radarMode: String(r.radarMode ?? ''),
    startMs: Number(r.startMs),
    endMs: Number(r.endMs),
    footprint: JSON.parse(String(r.footprint ?? '[]')),
    centroid: r.centroidLon != null && r.centroidLat != null ? [Number(r.centroidLon), Number(r.centroidLat)] : null,
  };
}
