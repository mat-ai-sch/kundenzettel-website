import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = (process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/').trim() || '/'

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'brand/favicon-32.png',
          'brand/favicon-48.png',
          'brand/apple-touch-icon.png',
          'brand/pwa-192.png',
          'brand/pwa-512.png',
          'brand/pwa-maskable-512.png',
        ],
        manifest: {
          id: '/',
          name: 'Kundenzettel',
          short_name: 'Kundenzettel',
          description:
            'Kundenzettel — WhatsApp-Aufträge, Chats und Kundendaten in einer App.',
          lang: 'de',
          dir: 'ltr',
          start_url: './',
          scope: './',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          background_color: '#fafafa',
          theme_color: '#ffffff',
          categories: ['business', 'productivity'],
          icons: [
            {
              src: 'brand/pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'brand/pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'brand/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Apply a newly deployed service worker at once. This keeps the
          // protected application from retaining stale document fallbacks for
          // old public asset URLs.
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: 'index.html',
          // The protected operator Worker owns every /api route.  Without
          // this exclusion Workbox treats an address-bar visit such as
          // /api/conversations as an SPA navigation and returns index.html
          // instead of the JSON response.  The same rule keeps live chat
          // data outside the service-worker cache.
      navigateFallbackDenylist: [/^\/(?:api|operator|kz|_v)\//, /^\/anbieter(?:\/|$)/],
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,woff2,jpg,jpeg,webp,webmanifest}',
          ],
          // Große Demo-Medien nicht in den Precache pressen
          globIgnores: [
            '**/media/demo/**',
            '**/media/**/*.mp4',
            // Lazy operator app (main.tsx -> import('./App')) and its
            // exclusive vendor chunks. Landing visitors share this service
            // worker, so precaching these would download the whole app for
            // them. They are cached on first use via runtimeCaching below.
            '**/assets/App-*.js',
            '**/assets/html2canvas-*.js',
            '**/assets/index.es-*.js',
            '**/assets/purify-*.js',
          ],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/(?:App|html2canvas|index\.es|purify)-[^/]+\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'operator-app-chunks',
                expiration: { maxEntries: 16 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  }
})
