import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import { alias, rendererInputs, rendererOptimizeDeps } from './vite.config.ts'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: {
        output: { entryFileNames: 'index.js', format: 'es' },
      },
    },
  },
  preload: {
    resolve: { alias },
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
    resolve: { alias, dedupe: ['three'] },
    optimizeDeps: rendererOptimizeDeps,
    plugins: [react(), tailwindcss()],
    build: {
      minify: true,
      rollupOptions: { input: rendererInputs },
    },
  },
})
