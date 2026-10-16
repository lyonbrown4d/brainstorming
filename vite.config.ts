import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export const alias = {
  '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
  '@layout': fileURLToPath(new URL('./src/layout', import.meta.url)),
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
}
export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  build: { outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)), emptyOutDir: true },
})
