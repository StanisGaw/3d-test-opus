import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works under any GitHub Pages sub-path (user.github.io/<repo>/).
  base: './',
  build: {
    // three.js alone is ~600 kB minified; the game ships as a single chunk on purpose.
    chunkSizeWarningLimit: 900,
  },
});
