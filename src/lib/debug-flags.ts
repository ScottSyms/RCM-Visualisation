/**
 * Optional runtime toggles via URL, for bisecting WebGL allocation failures:
 *   ?rcm=nopast     — don't load/draw the past dot cloud
 *   ?rcm=nodots     — draw past but decimate to 0 dots (keeps data loading)
 *   ?rcm=noglobe    — skip the Blue-Marble texture (Earth stays dark)
 *   ?rcm=noplanes   — don't reveal planned footprints at startup
 */
const params = new URLSearchParams(window.location.search);
const tags = params.get('rcm')?.split(',').map((s) => s.trim().toLowerCase()) ?? [];
const has = (k: string) => tags.includes(k);
const debugFlags = {
  nopast: has('nopast'),
  nodots: has('nodots'),
  noglobe: has('noglobe'),
  noplanes: has('noplanes'),
};
export { debugFlags };