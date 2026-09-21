/**
 * Natural-language command bar backend (Cloudflare Pages Function).
 *
 * POST { query: string, nowMs: number } -> { intent: CommandIntent }
 *
 * Translates a short free-text command into one of a closed set of
 * `CommandIntent`s (src/mission/types.ts) using Workers AI JSON mode, so the
 * model can only ever select from actions the client already knows how to
 * execute safely — it never invents an acquisition id or free-form state.
 * `toCommandIntent` re-validates every field itself; the JSON Schema keeps
 * the model on-format but is not trusted as the sole guard.
 *
 * Rate-limited per IP using the same D1 database Part A provisioned for the
 * acquisition archive (see migrations/0002_command_rate_limit.sql) — the
 * Workers AI free-tier budget is shared across every visitor, so a public
 * page needs *some* throttle even without per-user auth.
 */
import type { CommandIntent, RcmSatelliteName } from '../../src/mission/types.ts';

interface Env {
  AI: Ai;
  DB: D1Database;
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const SATELLITES: RcmSatelliteName[] = ['RCM-1', 'RCM-2', 'RCM-3'];
const LAYERS = ['planned', 'past', 'groundTrack'] as const;
const MODES = ['overview', 'follow'] as const;
const MAX_QUERY_CHARS = 300;
const RATE_LIMIT_PER_MINUTE = 8;
const RATE_WINDOW_MS = 60_000;

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'selectSatellite',
        'clearSelection',
        'setSatelliteFilter',
        'setLayerVisible',
        'setCameraMode',
        'setPlaying',
        'setSpeed',
        'seek',
        'seekRelative',
        'seekNow',
        'unrecognized',
      ],
    },
    satellite: { type: 'string', enum: SATELLITES },
    satellites: { type: 'array', items: { type: 'string', enum: SATELLITES } },
    layer: { type: 'string', enum: LAYERS },
    visible: { type: 'boolean' },
    mode: { type: 'string', enum: MODES },
    playing: { type: 'boolean' },
    multiplier: { type: 'number' },
    iso: { type: 'string' },
    deltaSeconds: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['type'],
} as const;

function systemPrompt(nowIso: string): string {
  return `You translate a short natural-language command about a live satellite mission dashboard into exactly one structured action. Respond only through the JSON schema — no prose, no extra fields.

Current mission time: ${nowIso} (UTC). The three spacecraft are RCM-1, RCM-2, RCM-3 (RADARSAT Constellation Mission, a Canadian SAR constellation).

Actions:
- selectSatellite: focus the camera on one spacecraft. requires "satellite".
- clearSelection: deselect the current satellite/acquisition.
- setSatelliteFilter: show only certain spacecraft's planned footprints. requires "satellites" (empty array means show all).
- setLayerVisible: toggle a layer on or off. requires "layer" (planned = upcoming footprints, past = historical coverage dots, groundTrack = orbit ground tracks) and "visible".
- setCameraMode: switch camera mode. requires "mode" (overview | follow). For "follow", also set "satellite" if the command names one.
- setPlaying: start or stop timeline playback. requires "playing".
- setSpeed: set the playback speed multiplier (typical values: 1, 10, 60, 300, 1800). requires "multiplier".
- seek: jump to an absolute UTC time explicitly stated in the command (a date/time was given). requires "iso" (ISO-8601 UTC).
- seekRelative: jump forward or backward by a duration relative to the current mission time (e.g. "forward 6 hours", "back 2 days"). requires "deltaSeconds" (negative = backward).
- seekNow: return the mission clock to the current real-world time (e.g. "now", "reset the clock").
- unrecognized: the command doesn't map to any action above — including asking to find or describe a specific acquisition by place/subject, since there is no action for that. requires "reason" (short, plain language).

Only include fields relevant to the chosen "type". Never invent an acquisition id or a satellite name outside RCM-1/RCM-2/RCM-3.`;
}

interface RawIntent {
  type?: string;
  satellite?: string;
  satellites?: string[];
  layer?: string;
  visible?: boolean;
  mode?: string;
  playing?: boolean;
  multiplier?: number;
  iso?: string;
  deltaSeconds?: number;
  reason?: string;
}

function isSat(v: unknown): v is RcmSatelliteName {
  return typeof v === 'string' && (SATELLITES as string[]).includes(v);
}

function unrecognized(reason: string): CommandIntent {
  return { type: 'unrecognized', reason };
}

/** Re-validates every field: the JSON Schema keeps the model on-format, this is the actual trust boundary. */
export function toCommandIntent(raw: RawIntent): CommandIntent {
  switch (raw.type) {
    case 'selectSatellite':
      return isSat(raw.satellite) ? { type: 'selectSatellite', satellite: raw.satellite } : unrecognized('no satellite named');
    case 'clearSelection':
      return { type: 'clearSelection' };
    case 'setSatelliteFilter':
      return { type: 'setSatelliteFilter', satellites: Array.isArray(raw.satellites) ? raw.satellites.filter(isSat) : [] };
    case 'setLayerVisible':
      return (LAYERS as readonly string[]).includes(raw.layer ?? '') && typeof raw.visible === 'boolean'
        ? { type: 'setLayerVisible', layer: raw.layer as (typeof LAYERS)[number], visible: raw.visible }
        : unrecognized('unclear which layer');
    case 'setCameraMode':
      return (MODES as readonly string[]).includes(raw.mode ?? '')
        ? { type: 'setCameraMode', mode: raw.mode as (typeof MODES)[number], satellite: isSat(raw.satellite) ? raw.satellite : undefined }
        : unrecognized('unclear camera mode');
    case 'setPlaying':
      return typeof raw.playing === 'boolean' ? { type: 'setPlaying', playing: raw.playing } : unrecognized('unclear play/pause');
    case 'setSpeed':
      return typeof raw.multiplier === 'number' && Number.isFinite(raw.multiplier) && raw.multiplier > 0
        ? { type: 'setSpeed', multiplier: raw.multiplier }
        : unrecognized('unclear speed');
    case 'seek': {
      const ms = typeof raw.iso === 'string' ? Date.parse(raw.iso) : NaN;
      return Number.isFinite(ms) ? { type: 'seek', ms } : unrecognized('unparseable time');
    }
    case 'seekRelative':
      return typeof raw.deltaSeconds === 'number' && Number.isFinite(raw.deltaSeconds)
        ? { type: 'seekRelative', deltaSeconds: raw.deltaSeconds }
        : unrecognized('unclear duration');
    case 'seekNow':
      return { type: 'seekNow' };
    case 'unrecognized':
      return unrecognized(typeof raw.reason === 'string' && raw.reason ? raw.reason : 'not understood');
    default:
      return unrecognized('not understood');
  }
}

function extractRaw(result: unknown): RawIntent | null {
  const resp = (result as { response?: unknown } | null)?.response;
  if (resp && typeof resp === 'object') return resp as RawIntent;
  if (typeof resp === 'string') {
    try {
      return JSON.parse(resp) as RawIntent;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fixed-window per-IP counter, atomic via SQLite's UPSERT...RETURNING (one
 * round trip, no read-then-write race). Fails open on a D1 error — a public
 * demo would rather degrade than go fully dark on a transient DB hiccup.
 */
async function withinRateLimit(db: D1Database, ip: string, nowMs: number): Promise<boolean> {
  const windowStart = Math.floor(nowMs / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  try {
    const row = await db
      .prepare(
        `INSERT INTO command_rate_limit (ip, windowStart, count) VALUES (?, ?, 1)
         ON CONFLICT(ip) DO UPDATE SET
           count = CASE WHEN command_rate_limit.windowStart = excluded.windowStart THEN command_rate_limit.count + 1 ELSE 1 END,
           windowStart = excluded.windowStart
         RETURNING count;`,
      )
      .bind(ip, windowStart)
      .first<{ count: number }>();
    return (row?.count ?? 0) <= RATE_LIMIT_PER_MINUTE;
  } catch {
    return true;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const ip = ctx.request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await withinRateLimit(ctx.env.DB, ip, Date.now()))) {
    return json({ intent: unrecognized('rate limited — try again in a minute') }, 429);
  }

  let body: { query?: unknown; nowMs?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ intent: unrecognized('malformed request') }, 400);
  }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_CHARS) : '';
  if (!query) return json({ intent: unrecognized('empty command') }, 400);
  const nowMs = typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : Date.now();

  try {
    const result = await ctx.env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(new Date(nowMs).toISOString()) },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
    });
    const raw = extractRaw(result);
    const intent = raw ? toCommandIntent(raw) : unrecognized('model returned no structured output');
    return json({ intent });
  } catch {
    return json({ intent: unrecognized('AI request failed') }, 502);
  }
};
