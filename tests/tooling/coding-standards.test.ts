import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { beforeAll, describe, expect, test } from 'vitest'

// Test the actual repository rules with snippets, without asking the type checker
// to resolve deliberately invalid fixture imports or redeclare real modules.
const eslint = new ESLint({ overrideConfig: [tseslint.configs.disableTypeChecked] })
beforeAll(async () => {
  await eslint.calculateConfigForFile('tests/tooling/coding-standards.test.ts')
}, 30_000)
const lint = async (source: string, filePath = 'tests/tooling/coding-standards.test.ts') => {
  const [result] = await eslint.lintText(source, { filePath })
  if (!result) throw new Error('ESLint did not return a result')
  expect(result.fatalErrorCount).toBe(0)
  return result.messages.map((message) => message.ruleId)
}

describe('repository coding standards', () => {
  test.each([
    "import { value } from './local'",
    "import type { Value } from '../local'",
    "export { value } from './local'",
    "export * from '../local'",
  ])('rejects relative static imports and re-exports: %s', async (source) => {
    expect(await lint(source)).toContain('no-restricted-imports')
  })

  test.each([
    "export const load = () => import('./local')",
    "export type Value = import('../local').Value",
  ])('rejects relative dynamic imports and type expressions: %s', async (source) => {
    expect(await lint(source)).toContain('no-restricted-syntax')
  })

  test('accepts aliases, external packages, Node built-ins and resource URLs', async () => {
    expect(
      await lint(
        [
          "export { createDocument } from '@core'",
          "export type { Topic } from '@core/types'",
          "export { resolve } from 'node:path'",
          "export { create } from 'zustand'",
          "export const load = () => import('@renderer/components/spatial/SpatialCanvas')",
          "export const resource = new URL('./asset.png', import.meta.url)",
        ].join('\n'),
      ),
    ).toEqual([])
  })

  test.each([
    'export function value() { return 1 }',
    'export const value = function () { return 1 }',
    'export const value = { run() { return 1 } }',
    'export class Value { run() { return 1 } }',
  ])('rejects non-arrow functions: %s', async (source) => {
    expect(await lint(source)).toContain('no-restricted-syntax')
  })

  test('accepts arrow functions, constructors and accessors', async () => {
    expect(
      await lint(
        [
          'export const value = () => 1',
          'export class Value {',
          '  constructor(readonly initial: number) {}',
          '  run = () => this.initial',
          '  get current() { return this.initial }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  test('counts comments and blank lines in the 300-line limit', async () => {
    const allowed = ['export const value = 1', ...Array<string>(299).fill('// comment'), ''].join(
      '\n',
    )
    expect(await lint(allowed)).not.toContain('max-lines')
    expect(await lint(allowed + '\n')).toContain('max-lines')
  })

  test('rejects new JavaScript files', async () => {
    expect(await lint('export const value = 1', 'tests/tooling/fixture.js')).toContain(
      'no-restricted-syntax',
    )
  })

  test('preserves the core dependency boundary after alias migration', async () => {
    expect(await lint("export { App } from '@renderer/App'", 'src/core/fixture.ts')).toContain(
      'no-restricted-imports',
    )
    expect(
      await lint("export { createDocument } from '@core/document'", 'src/core/fixture.ts'),
    ).toEqual([])
  })

  test('keeps downloaded shadcn and Dice UI sources excluded', async () => {
    const paths = [
      'src/components/ui/button.tsx',
      'src/hooks/use-ref-with-init.ts',
      'src/hooks/use-value-as-ref.ts',
    ]
    expect(await Promise.all(paths.map((path) => eslint.isPathIgnored(path)))).toEqual([
      true,
      true,
      true,
    ])
  })
})
