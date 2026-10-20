import { describe, expect, it } from 'vitest'
import { normalizeOpenedDocument, serializeDroppedFiles } from '@renderer/lib/nativeImports'

describe('native import boundary', () => {
  it('passes the native converted document, source path and warnings through unchanged', () => {
    const opened = {
      path: null,
      sourcePath: '/maps/map.xmind',
      contents: '{"format":"brainstorming"}',
      warnings: ['未导入 XMind 扩展属性（1 项）'],
    }
    expect(normalizeOpenedDocument(opened)).toBe(opened)
    expect(normalizeOpenedDocument(null)).toBeNull()
  })
  it('serializes small HTML Files without depending on an Electron file path', async () => {
    const files = await serializeDroppedFiles([
      new File(['abc'], 'notes.txt', { type: 'text/plain' }),
    ])
    expect(files).toEqual([{ name: 'notes.txt', mimeType: 'text/plain', bytes: [97, 98, 99] }])
  })
  it('rejects aggregate HTML uploads above the bound before reading file bytes', async () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.bin')
    await expect(serializeDroppedFiles([file])).rejects.toThrow('8 MiB')
  })
})
