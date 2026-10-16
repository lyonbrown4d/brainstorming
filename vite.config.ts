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
// Include the lazy 3D add-on up front so first use never triggers a full-page optimizer reload.
export const rendererOptimizeDeps = {
  include: [
    '@react-three/fiber',
    '@react-three/drei',
    'three',
    'three/addons/loaders/SVGLoader.js',
    '@iconify/react/offline',
    '@iconify-json/simple-icons',
  ],
}
export const rendererInputs = {
  index: fileURLToPath(new URL('./src/renderer/index.html', import.meta.url)),
  splash: fileURLToPath(new URL('./src/renderer/splash.html', import.meta.url)),
}
export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias, dedupe: ['three'] },
  optimizeDeps: rendererOptimizeDeps,
  build: {
    outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: rendererInputs },
  },
})
