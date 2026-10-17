import { defineConfig } from 'vitest/config'
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // Bound concurrency so toolchain initialization does not compete with every test file.
    maxWorkers: 4,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
