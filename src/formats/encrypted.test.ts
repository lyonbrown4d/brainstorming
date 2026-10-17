import { describe, expect, it } from 'vitest'
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { createDocument, createWorkbook } from '@core'
import {
  encryptBrainstorming,
  decryptBrainstorming,
  isEncryptedBrainstorming,
} from '@formats/encrypted'
import { encodeBrainstorming } from '@formats/brainstorming'

const workbook = createWorkbook(createDocument('Protected 中文文档', 'encrypted-test'))
const password = 'test-password-123'
describe('AES-256 native ZIP boundary', () => {
  it('roundtrips native content, authenticates encrypted entries and distinguishes ordinary files', async () => {
    expect(await isEncryptedBrainstorming(encodeBrainstorming(workbook))).toBe(false)
    const bytes = await encryptBrainstorming(workbook, password)
    expect(await isEncryptedBrainstorming(bytes)).toBe(true)
    expect(await decryptBrainstorming(bytes, password)).toEqual(workbook)
    await expect(decryptBrainstorming(bytes, 'wrong-password')).rejects.toThrow('密码错误')
    await expect(encryptBrainstorming(workbook, 'short')).rejects.toThrow('8 至 128')
    const damaged = bytes.slice()
    const header = new DataView(damaged.buffer)
    const payload = 30 + header.getUint16(26, true) + header.getUint16(28, true) + 18
    damaged[payload] = (damaged[payload] ?? 0) ^ 1
    await expect(decryptBrainstorming(damaged, password)).rejects.toThrow()
  })
  it('rejects unsafe paths, unprotected entries and missing native manifests', async () => {
    for (const [name, encrypted] of [
      ['../document.json', true],
      ['document.json', false],
      ['missing.json', true],
    ] as const) {
      const writer = new ZipWriter(new Uint8ArrayWriter(), {
        useWebWorkers: false,
        password,
        encryptionStrength: 3,
        zip64: false,
      })
      await writer.add(name, new Uint8ArrayReader(new TextEncoder().encode('{}')), {
        ...(encrypted ? {} : { password: '' }),
      })
      const bytes = await writer.close()
      await expect(decryptBrainstorming(bytes, password)).rejects.toThrow()
    }
  })
})
