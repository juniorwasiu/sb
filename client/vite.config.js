import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In development: forward /api calls to the local Express server
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },

    },
  },
})
