import './lib/styles.css';
import App from './app/App.svelte';
import { mount } from 'svelte';

// Cesium ships as its self-contained UMD build (public/cesium/Cesium.js) attached to
// `window.Cesium`. The base URL is already set in index.html before that script loads;
// re-assert it here defensively for any early asset resolution.
window.CESIUM_BASE_URL = window.CESIUM_BASE_URL ?? '/cesium/';

const root = document.querySelector('#app');
if (!root) throw new Error('missing #app mount point');

mount(App, { target: root });
