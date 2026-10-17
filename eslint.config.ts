import js from '@eslint/js'
import { fixupPluginRules } from '@eslint/compat'
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
      'dist/**',
      'out/**',
      'test-results-desktop/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      'release/**',
      'coverage/**',
      'storybook-static/**',
      'test-results/**',
      'playwright-report/**',
      '.moon/cache/**',
      'apm_modules/**',
      // Third-party shadcn source is kept verbatim; business wrappers remain linted.
      'src/components/ui/**',
      // Dice UI Stepper helpers downloaded by shadcn; keep upstream source intact.
      'src/hooks/use-value-as-ref.ts',
      'src/hooks/use-ref-with-init.ts',
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
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
      'no-restricted-syntax': [
        'error',
        { selector: 'FunctionDeclaration', message: '函数统一使用 const 箭头函数。' },
        {
          selector:
            'FunctionExpression:not([parent.type="MethodDefinition"][parent.kind=/^(constructor|get|set)$/]):not([parent.type="Property"][parent.kind=/^(get|set)$/])',
          message: '函数、回调及方法统一使用箭头函数；构造函数保留语言语法。',
        },
        {
          selector: ':matches(ImportExpression, TSImportType)[source.value=/^\\./]',
          message: '项目内部动态导入和 import 类型表达式使用 @ 别名。',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./**', '../**'], message: '项目内部导入和再导出统一使用 @ 别名。' },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: {
      react: fixupPluginRules(react),
      'react-hooks': { rules: reactHooks.rules },
      'jsx-a11y': fixupPluginRules(jsxA11y),
    },
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
          paths: ['react', 'react-dom', '@xyflow/react', 'lexical'],
          patterns: [
            { group: ['./**', '../**'], message: '项目内部导入和再导出统一使用 @ 别名。' },
            {
              group: [
                '@lexical/*',
                '@renderer/*',
                '@layout',
                '@layout/*',
                '@tauri-apps/*',
                '@formats',
                '@formats/*',
                '@assets',
                '@assets/*',
                '@tests/*',
                '@stories/*',
                '@project/*',
              ],
              message: 'Core 只能依赖纯 TypeScript 领域模块。',
            },
          ],
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
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.{js,jsx,mjs,cjs}'],
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message: '手写源码、测试、配置和脚本使用 TypeScript（.ts / .tsx）。',
        },
      ],
    },
  },
  prettier,
)
