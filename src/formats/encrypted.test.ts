import { describe, expect, it } from 'vitest'
import { createDocument, createWorkbook } from '@core'
import {
  encryptBrainstorming,
  decryptBrainstorming,
  isEncryptedBrainstorming,
} from '@formats/encrypted'
import { encodeBrainstorming } from '@formats/brainstorming'

const workbook = createWorkbook(createDocument('Protected 中文文档', 'encrypted-test'))
const password = 'test-password-123'
describe('encrypted native SQLite boundary', () => {
  it('encrypts native pages, validates passwords and distinguishes ordinary SQLite', async () => {
    expect(await isEncryptedBrainstorming(await encodeBrainstorming(workbook))).toBe(false)
    const bytes = await encryptBrainstorming(workbook, password)
    expect(await isEncryptedBrainstorming(bytes)).toBe(true)
    expect(Buffer.from(bytes).includes(Buffer.from('Protected'))).toBe(false)
    expect(await decryptBrainstorming(bytes, password)).toEqual(workbook)
    await expect(decryptBrainstorming(bytes, 'wrong-password')).rejects.toThrow('密码错误')
    await expect(encryptBrainstorming(workbook, 'short')).rejects.toThrow('8 至 128')
    const damaged = bytes.slice()
    damaged[0] = (damaged[0] ?? 0) ^ 1
    await expect(decryptBrainstorming(damaged, password)).rejects.toThrow()
  })
  it('rejects ZIP and truncated input instead of supporting legacy encryption', async () => {
    await expect(decryptBrainstorming(new Uint8Array([80, 75, 3, 4]), password)).rejects.toThrow(
      'ZIP',
    )
    const legacy = new TextEncoder().encode(' { "format": "brainstorming", "version": 2}')
    await expect(isEncryptedBrainstorming(legacy)).rejects.toThrow('JSON')
    await expect(isEncryptedBrainstorming(new Uint8Array())).rejects.toThrow('不完整')
  })
})
