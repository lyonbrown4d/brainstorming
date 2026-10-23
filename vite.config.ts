import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import type { RendererConfig } from '@project/config/renderer'

const renderer = JSON.parse(
  readFileSync(new URL('./config/renderer.json', import.meta.url), 'utf8'),
) as RendererConfig

export default defineConfig({
  base: './',
  resolve: { tsconfigPaths: true },
  optimizeDeps: renderer.optimizeDeps,
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST ?? '127.0.0.1' },
  build: {
    outDir: 'dist',
    manifest: true,
    emptyOutDir: true,
    target: ['es2022', 'chrome111', 'safari16.4'],
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        splash: fileURLToPath(new URL('./splash.html', import.meta.url)),
      },
    },
  },
})
