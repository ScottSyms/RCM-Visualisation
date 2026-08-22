import type { Scene, Viewer } from 'cesium';

/**
 * Create a Viewer with Cesium's default chrome stripped out (we draw our own HUD).
 * No imagery provider is requested here (avoids any ion token dependency); the
 * Base Marvel texture is applied in `EarthStyle`.
 */
export function createViewer(container: HTMLElement): Viewer {
  const viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: true,
    baseLayer: false,
    // keep the built-in credit container — provenance must stay visible (spec §25)
    terrain: undefined,
  });

  const scene: Scene = viewer.scene;
  // silent, painterly default color while imagery loads / if it is missing
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1420');
  scene.backgroundColor = Cesium.Color.fromCssColorString('#01030a');
  scene.globe.enableLighting = false;
  scene.globe.maximumScreenSpaceError = 8;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
  // Work around a Cesium-on-macOS-ANGLE/Metal quirk where the Globe's HDR
  // composite / post-processing pass renders opaque instead of compositing the
  // ellipsoid+terrain (starbox draws; Globe is black; no GL error logged).
  // Disable HDR + post-processing so the Globe draws in a straight LDR pass.
  scene.highDynamicRange = false;
  if (scene.postProcessStages) scene.postProcessStages.removeAll();
  // Expose handles for automated diagnostics (playwright scripts) and live console poking.
  if (typeof window !== 'undefined') {
    (window as any).__cesiumViewer = viewer;
    (window as any).__cesiumScene = viewer.scene;
  }
  return viewer;
}
