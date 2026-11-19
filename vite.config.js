import { defineConfig } from 'vite';

// `npm run dev`: Vite with hot reload, API proxied to `npm run server` on 4321.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: { proxy: { '/api': 'http://127.0.0.1:4321' } },
});
