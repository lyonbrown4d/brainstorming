import type { RendererConfig } from '@project/config/renderer'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
const rendererOptions = JSON.parse(
  readFileSync(new URL('./config/renderer.json', import.meta.url), 'utf8'),
) as RendererConfig
const rendererOptimizeDeps = rendererOptions.optimizeDeps

export default defineConfig({
  main: {
    resolve: { tsconfigPaths: true },
    build: {
      rollupOptions: {
        output: { entryFileNames: 'index.js', format: 'es' },
      },
    },
  },
  preload: {
    resolve: { tsconfigPaths: true },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), splash: resolve('src/preload/splash.ts') },
        // Keep entries independent: sandboxed preload require() cannot load local chunks.
        output: { entryFileNames: '[name].cjs', format: 'cjs' },
      },
    },
  },
  renderer: {
    base: './',
    resolve: { tsconfigPaths: true, dedupe: ['three'] },
    optimizeDeps: rendererOptimizeDeps,
    plugins: [react(), tailwindcss()],
    build: {
      minify: true,
      rollupOptions: {
        input: Object.fromEntries(
          Object.entries(rendererOptions.inputs).map(([name, path]) => [
            name,
            fileURLToPath(new URL(path, import.meta.url)),
          ]),
        ),
      },
    },
  },
})
