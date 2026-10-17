import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
type StorageOperation = 'language:set' | 'language:get' | 'recovery:read' | 'recovery:replace'

/** Execute the real SQLite repository under Electron's Node ABI, without opening native windows. */
export const storageOperation = async (
  operation: StorageOperation,
  directory: string,
  payload?: string,
): Promise<unknown> => {
  const { stdout } = await execute(
    process.execPath,
    [
      resolve('node_modules/electron/cli.js'),
      '--import',
      'tsx',
      resolve('tests/electron/storage-fixture.ts'),
      operation,
      directory,
      ...(payload === undefined ? [] : [payload]),
    ],
    {
      cwd: resolve('.'),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    },
  )
  const result: unknown = JSON.parse(stdout)
  return result
}
