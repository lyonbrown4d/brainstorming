import type { RendererConfig } from '@project/config/renderer'
import { readFileSync } from 'node:fs'
import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
const rendererOptions = JSON.parse(
  readFileSync(new URL('../config/renderer.json', import.meta.url), 'utf8'),
) as RendererConfig
const rendererOptimizeDeps = rendererOptions.optimizeDeps
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  // Production roots have a viewport height; previews need the same canvas contract.
  previewHead: (head) => `${head}<style>#storybook-root { height: 100dvh; }</style>`,
  stories: ['../stories/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  viteFinal: (config) =>
    mergeConfig(config, {
      cacheDir: config.cacheDir ?? resolve('node_modules/.vite/brainstorming-storybook'),
      resolve: { tsconfigPaths: true },
      optimizeDeps: rendererOptimizeDeps,
      plugins: [babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    }),
}
export default config
