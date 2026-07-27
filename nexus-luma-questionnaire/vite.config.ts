import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: "/questionnaire/",
  plugins: [react()],
  build: {
    outDir: "../questionnaire",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8888",
    },
  },
})
