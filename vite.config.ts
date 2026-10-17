import type { RendererConfig } from '@project/config/renderer'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
const rendererOptions = JSON.parse(
  readFileSync(new URL('./config/renderer.json', import.meta.url), 'utf8'),
) as RendererConfig
const rendererOptimizeDeps = rendererOptions.optimizeDeps

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: './',
  // Electron keeps its own default cache; a web preview must not replace its React prebundle.
  cacheDir: fileURLToPath(new URL('./node_modules/.vite/trelyx-web', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true, dedupe: ['three'] },
  optimizeDeps: rendererOptimizeDeps,
  build: {
    outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(rendererOptions.inputs).map(([name, path]) => [
          name,
          fileURLToPath(new URL(path, import.meta.url)),
        ]),
      ),
    },
  },
})
