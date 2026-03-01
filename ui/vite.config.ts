import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const base = '/co2ble/'
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CO2 Monitor',
        short_name: 'CO2',
        description: 'Monitor CO2 concentration, temperature and humidity',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}maskable-icon-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
