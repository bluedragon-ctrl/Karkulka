import { defineConfig } from 'vitest/config';

// Relative base so the site works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: { environment: 'node' },
});
