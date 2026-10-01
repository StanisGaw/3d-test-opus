import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~600 kB minified; the game ships as a single chunk on purpose.
    chunkSizeWarningLimit: 900,
  },
});
