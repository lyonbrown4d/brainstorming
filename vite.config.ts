import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
}
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  build: { outDir: 'out/renderer' },
})
