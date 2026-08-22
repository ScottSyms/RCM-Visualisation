// Downloads public-domain static assets used by the scene.
// All sources are public domain / CC0 and are vendored into public/.
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This file lives in scripts/assets/ → project root is two levels up.
const root = fileURLToPath(new URL('../..', import.meta.url));

const ASSETS = [
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Blue_Marble_Next_Generation_%2B_topography_%2B_bathymetry.jpg',
    out: 'public/textures/earth-day.jpg',
    minBytes: 200_000,
    // Downscale at ingest: 3600x1800 equirect has ~20 MB of GPU pixels, which
    // triggers an ArrayBuffer allocation failure on some integrated GPUs during
    // Cesium's SingleTileImageryProvider texture upload. 1024x512 (≈1.5 MB RGB)
    // is indistinguishable on an orbital globe and keeps the upload small.
    maxWidth: 1024,
  },
  {
    // Natural Earth 110m country borders (public domain).
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
    out: 'public/geography/ne110m-admin0-countries.geojson',
    minBytes: 50_000,
  },
];

async function fetchTo(url, out, minBytes, maxWidth) {
  mkdirSync(join(root, 'public'), { recursive: true });
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const target = join(root, out);
  mkdirSync(dirname(target), { recursive: true });
  await pipeline(
    new ReadableStream({
      start(controller) {
        const reader = res.body.getReader();
        (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        })();
      },
    }),
    createWriteStream(target),
  );
  let size = statSync(target).size;

  // Downscale oversized imagery on macOS (sips). Keeps the GPU texture upload
  // (and the interim JS pixel buffer) small enough to render on integrated GPUs.
  if (typeof maxWidth === 'number' && process.platform === 'darwin' && size >= minBytes) {
    try {
      execFileSync('sips', ['-Z', String(maxWidth), target, '--out', target], {
        stdio: 'pipe',
      });
      size = statSync(target).size;
    } catch (err) {
      console.warn(`  downscale skipped (${err.message})`);
    }
  }

  if (size < minBytes) {
    rmSync(target, { force: true });
    throw new Error(`Downloaded file too small (${size} bytes): ${url}`);
  }
  return size;
}

for (const a of ASSETS) {
  process.stdout.write(`downloading ${a.out} ... `);
  try {
    const size = await fetchTo(a.url, a.out, a.minBytes, a.maxWidth);
    console.log(`${(size / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    process.exitCode = 1;
  }
}
