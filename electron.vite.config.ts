import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import { alias } from './vite.config.ts'

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
        output: { entryFileNames: 'index.cjs', format: 'cjs' },
      },
    },
  },
  renderer: {
    base: './',
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: { minify: true },
  },
})
