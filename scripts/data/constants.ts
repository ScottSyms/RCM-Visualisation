/**
 * Endpoints, layer ids, and ingest defaults.
 *
 * Government acquisition plan (source of record):
 *   - ArcGIS REST MapServer (platform agnostic, f=geojson outSR=4326)
 *   - REST layer 0 = Planned (future), 1 = Past  (WMS numbering is INVERTED)
 *   - Some WMS consumers require port 443 on the alternate hostname.
 */
export const GOV = {
  mapServer:
    'https://maps-cartes.services.geo.ca/server_serveur/rest/services/CSA/radarsat_constellation_mission_plan_en/MapServer',
  plannedLayer: 0,
  pastLayer: 1,
} as const;

export const CELESTRAK = {
  baseUrl: 'https://celestrak.org/NORAD/elements/gp.php',
  /** NORAD catalog ids verified against the live GP feed. */
  satellites: [
    { name: 'RCM-1', catnr: 44322 },
    { name: 'RCM-2', catnr: 44324 },
    { name: 'RCM-3', catnr: 44323 },
  ],
} as const;

/** Ingest defaults. */
export const INGEST = {
  /** slice count per acquisition footprint (spec 10.3). */
  sliceCount: 64,
  /**
   * Raw-sample grid spacing for the ephemeris debug package (ms). Raw samples
   * are the *source-of-truth points* for the debug overlay; the browser derives
   * accurate positions by re-propagating the TLE with SGP4 (same model), so this
   * can be coarse. ~2 min keeps the package to a few MB over a two-week window.
   */
  ephemerisStepMs: 120_000,
  /** seconds of camera pre-roll before the first planned acquisition. */
  clockPreRollMs: 30_000,
  resources: {
    timeoutMs: 300_000,
    maxBytes: 256 * 1024 * 1024,
  },
} as const;
