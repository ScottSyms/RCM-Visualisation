import type { ImageryLayer, Viewer } from 'cesium';

/**
 * Apply the cinematic Earth styling. Primary source: NASA GIBS Blue Marble
 * Next Generation WMTS tiles (multi-resolution, levels 0–8, public domain,
 * no token). If the service is unreachable the bundled single-tile Blue
 * Marble JPEG is used instead (coarse, but fully offline). The imagery layer
 * is darkened + desaturated per spec §5.3 so oceans read as navy/black and
 * the acquisition overlays stand out.
 */
const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration';
const GIBS_TEMPLATE = `${GIBS_BASE}/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg`;
const GIBS_PROBE = `${GIBS_BASE}/default/GoogleMapsCompatible_Level8/0/0/0.jpeg`;

/** One small level-0 tile decides whether GIBS is reachable from here. */
async function gibsReachable(): Promise<boolean> {
  try {
    const res = await fetch(GIBS_PROBE, { signal: AbortSignal.timeout(6_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function styleEarth(viewer: Viewer): Promise<void> {
  const scene = viewer.scene;
  scene.globe.enableLighting = false;

  let layer: ImageryLayer | null = null;
  try {
    const provider = (await gibsReachable())
      ? new Cesium.WebMapTileServiceImageryProvider({
          url: GIBS_TEMPLATE,
          layer: 'BlueMarble_NextGeneration',
          style: 'default',
          format: 'image/jpeg',
          tileMatrixSetID: 'GoogleMapsCompatible_Level8',
          tileWidth: 256,
          tileHeight: 256,
          maximumLevel: 8,
          credit: 'NASA Blue Marble Next Generation (public domain)',
        })
      : await Cesium.SingleTileImageryProvider.fromUrl('/textures/earth-day.jpg', {
          credit: 'NASA Blue Marble (public domain)',
        }); // Fetched into public/textures by `npm run assets`.
    layer = viewer.imageryLayers.addImageryProvider(provider);
  } catch {
    // leave the dark base color; the scene is still readable via lighting + vectors
  }

  if (layer) {
    // spec §5.3 art direction: darkened + desaturated basemap
    layer.brightness = 0.62;
    layer.saturation = 0.45;
    layer.contrast = 1.16;
  }

  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
}
