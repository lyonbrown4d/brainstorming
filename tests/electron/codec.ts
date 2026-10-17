import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { MindMapWorkbook } from '@core'
import { deserializeWorkbook } from '@core'
import type { NativeReadOptions } from '@main/document-db'
export { isEncryptedBrainstorming } from '@formats/encrypted'

const execute = promisify(execFile)
/** Fixture codecs run under the same native SQLite ABI as the desktop app. */
const codec = async (
  operation: 'encode' | 'decode' | 'decrypt',
  input: Uint8Array | MindMapWorkbook,
  options: NativeReadOptions = {},
): Promise<Buffer> => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-codec-'))
  try {
    await writeFile(join(directory, 'options.json'), JSON.stringify(options), { mode: 0o600 })
    await writeFile(
      join(directory, 'input'),
      input instanceof Uint8Array ? input : JSON.stringify(input),
      { mode: 0o600 },
    )
    await execute(
      process.execPath,
      [
        resolve('node_modules/electron/cli.js'),
        '--import',
        'tsx',
        resolve('tests/electron/codec-fixture.ts'),
        operation,
        directory,
      ],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      },
    )
    return await readFile(join(directory, 'output'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
export const encodeBrainstorming = (
  workbook: MindMapWorkbook,
  options: NativeReadOptions = {},
): Promise<Uint8Array> => codec('encode', workbook, options)
export const decodeBrainstorming = async (
  bytes: Uint8Array,
  options: NativeReadOptions = {},
): Promise<MindMapWorkbook> =>
  deserializeWorkbook((await codec('decode', bytes, options)).toString('utf8'))
export const decryptBrainstorming = async (
  bytes: Uint8Array,
  password: string,
): Promise<MindMapWorkbook> =>
  deserializeWorkbook((await codec('decrypt', bytes, { password })).toString('utf8'))
