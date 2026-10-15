import { defineConfig } from 'vitest/config'
import { alias } from './vite.config.ts'
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
