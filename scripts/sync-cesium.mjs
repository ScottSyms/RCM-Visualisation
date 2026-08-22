// Copies the prebuilt UMD Cesium runtime into public/ so the UMD bundle
// (Cesium.js) stays consistent with its own Workers/ / Assets/ / Widgets/ /
// ThirdParty/. The ESM entries (index.js / index.cjs) are deliberately skipped:
// the browser loads the UMD via <script> and window.CESIUM_BASE_URL, never ESM.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const dst = join(root, 'public', 'cesium');

if (!existsSync(src)) {
  console.error('[sync:cesium] node_modules/cesium/Build/Cesium not found — run npm install first');
  process.exit(1);
}

const parts = ['Cesium.js', 'Assets', 'ThirdParty', 'Widgets', 'Workers'];
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const part of parts) {
  cpSync(join(src, part), join(dst, part), { recursive: true });
}
console.log('[sync:cesium] UMD Cesium runtime copied to public/cesium');
