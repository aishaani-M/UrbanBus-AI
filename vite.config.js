import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': {
        target: 'wss://urbanbus-ai.onrender.com',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'https://urbanbus-ai.onrender.com',
        changeOrigin: true,
      },
      '/health': {
        target: 'https://urbanbus-ai.onrender.com',
        changeOrigin: true,
      },
    },
  },
})