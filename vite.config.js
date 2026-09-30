import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => ({
  base: process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : '/',
  build: {
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
    port: Number(process.env.PORT || 8443),
    strictPort: true,
  },
  preview: {
    host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
    port: Number(process.env.PORT || 8443),
  },
}))
