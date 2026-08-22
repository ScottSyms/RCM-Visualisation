import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: {
    alias: {
      // Keep the satellite.js WASM/worker runtime out of the browser bundle
      // (see src/vendor/satellite-pure.ts).
      'satellite.js': fileURLToPath(
        new URL('./src/vendor/satellite-pure.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          // keep Cesium in its own chunk — it is the largest dependency
          if (id.includes('node_modules') && id.includes('cesium')) return 'cesium';
          return undefined;
        },
      },
    },
  },
});
