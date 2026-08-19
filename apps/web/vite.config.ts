import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Papfish - Chess Repertoire Trainer',
        short_name: 'Papfish',
        description:
          'Explore openings, build a personal repertoire and train it against realistic opponents.',
        theme_color: '#0f172a',
        background_color: '#0b1120',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['education', 'games'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The engine binary is several megabytes; it is cached on first use
        // instead of being precached, so the first load stays fast.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['**/engine/**', '**/data/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/engine\//],
        runtimeCaching: [
          {
            urlPattern: /\/engine\/.*\.(js|wasm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'papfish-engine',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'papfish-reference-data',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': resolvePath('./src'),
      '@papfish/core': resolvePath('../../packages/core/src/index.ts'),
    },
  },
  build: {
    target: 'es2022',
    // The bundle is emitted to <repo>/dist rather than apps/web/dist so that it
    // lands where a host looking for the conventional top-level output finds it,
    // without depending on a dashboard setting being configured correctly.
    outDir: resolvePath('../../dist'),
    emptyOutDir: true,
  },
});
