import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// HTTPS + host:true so the camera works when testing from a phone on the same Wi-Fi
// (browsers only allow getUserMedia on secure origins other than localhost).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    // Templates live in ../shared, outside the app root.
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
