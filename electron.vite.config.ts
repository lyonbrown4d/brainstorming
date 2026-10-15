import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import { alias } from './vite.config.ts'

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: resolve('electron/main.ts'),
        output: { entryFileNames: 'index.js', format: 'es' },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: resolve('electron/preload.ts'),
        output: { entryFileNames: 'index.cjs', format: 'cjs' },
      },
    },
  },
  renderer: {
    root: '.',
    base: './',
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: { minify: true, rollupOptions: { input: resolve('index.html') } },
  },
})
