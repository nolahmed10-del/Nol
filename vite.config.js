import { defineConfig } from 'vite';

// Base path for GitHub Pages. Update if your repository name changes.
const repoBase = '/Nol/';

export default defineConfig({
  base: repoBase,
  server: {
    port: 5173
  }
});
