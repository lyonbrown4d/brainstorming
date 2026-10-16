import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'release/**',
      'coverage/**',
      'storybook-static/**',
      'test-results/**',
      'playwright-report/**',
      '.moon/cache/**',
      'apm_modules/**',
      // Third-party shadcn source is kept verbatim; business wrappers remain linted.
      'src/renderer/src/components/ui/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { react, 'react-hooks': { rules: reactHooks.rules }, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'electron', '@xyflow/react', 'lexical'],
          patterns: ['@lexical/*', '@renderer/*', '@layout'],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'HTMLElement',
        'KeyboardEvent',
        'PointerEvent',
      ],
    },
  },
  prettier,
)
