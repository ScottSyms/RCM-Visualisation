/**
 * Cesium is loaded as a self-contained UMD build from index.html, which attaches a
 * `Cesium` global. This exposes that runtime global to TypeScript, typed as the full
 * `cesium` package namespace. `import('cesium')` here is type-only, so `vite` does not
 * bundle the (large) ESM library — only the UMD global is used at runtime.
 */
declare const Cesium: typeof import('cesium');

interface Window {
  CESIUM_BASE_URL?: string;
}
