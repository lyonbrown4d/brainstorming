import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { alias, rendererOptimizeDeps } from '../vite.config.ts'
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../stories/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  viteFinal: (config) =>
    mergeConfig(config, {
      resolve: { alias, dedupe: ['three'] },
      optimizeDeps: rendererOptimizeDeps,
      plugins: [tailwindcss()],
    }),
}
export default config
