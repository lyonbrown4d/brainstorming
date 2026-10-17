import { describe, expect, it } from 'vitest'
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { createDocument, createWorkbook } from '@core'
import { encryptTrelyx, decryptTrelyx, isEncryptedTrelyx } from '@formats/encrypted'
import { encodeTrelyx } from '@formats/trelyx'

const workbook = createWorkbook(createDocument('Protected 中文文档', 'encrypted-test'))
const password = 'test-password-123'
describe('AES-256 native ZIP boundary', () => {
  it('roundtrips native content, authenticates encrypted entries and distinguishes ordinary files', async () => {
    expect(await isEncryptedTrelyx(encodeTrelyx(workbook))).toBe(false)
    const bytes = await encryptTrelyx(workbook, password)
    expect(await isEncryptedTrelyx(bytes)).toBe(true)
    expect(await decryptTrelyx(bytes, password)).toEqual(workbook)
    await expect(decryptTrelyx(bytes, 'wrong-password')).rejects.toThrow('密码错误')
    await expect(encryptTrelyx(workbook, 'short')).rejects.toThrow('8 至 128')
    const damaged = bytes.slice()
    const header = new DataView(damaged.buffer)
    const payload = 30 + header.getUint16(26, true) + header.getUint16(28, true) + 18
    damaged[payload] = (damaged[payload] ?? 0) ^ 1
    await expect(decryptTrelyx(damaged, password)).rejects.toThrow()
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
      await expect(decryptTrelyx(bytes, password)).rejects.toThrow()
    }
  })
})
