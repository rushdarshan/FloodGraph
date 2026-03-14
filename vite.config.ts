import { defineConfig } from 'vite';

export default defineConfig({
  base: '/FloodGraph/',
  // Required for Pyodide SharedArrayBuffer support in dev
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          pmtiles: ['pmtiles'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
