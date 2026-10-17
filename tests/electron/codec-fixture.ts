import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deserializeWorkbook } from '@core'
import { encodeBrainstorming, decodeBrainstorming } from '@formats/brainstorming'
import { decryptBrainstorming } from '@formats/encrypted'
import type { NativeReadOptions } from '@main/document-db'

const [operation, directory] = process.argv.slice(2)
if (!directory) throw new Error('Missing codec fixture directory')
const options = JSON.parse(
  await readFile(join(directory, 'options.json'), 'utf8'),
) as NativeReadOptions
const input = await readFile(join(directory, 'input'))
const output =
  operation === 'encode'
    ? await encodeBrainstorming(deserializeWorkbook(input.toString('utf8')), options)
    : JSON.stringify(
        operation === 'decrypt'
          ? await decryptBrainstorming(input, options.password ?? '')
          : await decodeBrainstorming(input, options),
      )
await writeFile(join(directory, 'output'), output, { mode: 0o600 })
