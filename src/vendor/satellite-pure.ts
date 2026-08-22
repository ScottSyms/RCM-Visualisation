// The 'satellite.js' package barrel (dist/index.js) re-exports its WASM runtime
// (dist/wasm/*), whose dynamic #wasm-* imports resolve to a pthreads web-worker
// build that Vite cannot inline for the browser. Vite aliases 'satellite.js' to
// this module for every client build; it re-exports exactly the classic pure-JS
// SGP4 API the app uses, from a dist subgraph that is fully closed and wasm-free.
export { twoline2satrec } from '../../node_modules/satellite.js/dist/io.js';
export { propagate, gstime } from '../../node_modules/satellite.js/dist/propagation.js';
export { eciToEcf } from '../../node_modules/satellite.js/dist/transforms.js';
