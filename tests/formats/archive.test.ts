import { describe, expect, it } from 'vitest'
import { strToU8, zipSync, Zip, ZipDeflate } from 'fflate'
import { ARCHIVE_LIMITS, readArchive } from '@formats/archive'

const centralOffsets = (bytes: Uint8Array): number[] => {
  const offsets: number[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let cursor = 0; cursor + 4 <= bytes.length; cursor++) {
    if (view.getUint32(cursor, true) === 0x02014b50) offsets.push(cursor)
  }
  return offsets
}

const centralOffset = (bytes: Uint8Array, index = 0): number => {
  const offset = centralOffsets(bytes)[index]
  if (offset === undefined) throw new Error('Test fixture is missing a central directory entry')
  return offset
}

const mutateSize = (bytes: Uint8Array, size: number): Uint8Array => {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  for (const offset of centralOffsets(copy)) {
    view.setUint32(offset + 24, size, true)
    view.setUint32(view.getUint32(offset + 42, true) + 22, size, true)
  }
  return copy
}

describe('bounded ZIP archive reading', () => {
  it('reads stored and compressed entries, including streamed data descriptors', () => {
    expect(
      readArchive(
        zipSync({ 'stored.txt': [strToU8('原文'), { level: 0 }], 'empty/': new Uint8Array() }),
      ).get('stored.txt'),
    ).toEqual(strToU8('原文'))
    const chunks: Uint8Array[] = []
    const zip = new Zip((error, chunk) => {
      if (error) throw error
      chunks.push(chunk)
    })
    const entry = new ZipDeflate('streamed.txt')
    zip.add(entry)
    entry.push(strToU8('内容'.repeat(2000)), true)
    zip.end()
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    expect(readArchive(bytes).get('streamed.txt')).toEqual(strToU8('内容'.repeat(2000)))
  })

  it.each(['../escape', '/absolute', 'C:/drive', 'a\\b', 'a/./b', 'a//b', 'null\0name'])(
    'rejects unsafe archive path %j',
    (name) => {
      expect(() => readArchive(zipSync({ [name]: strToU8('x') }))).toThrow(/不安全/u)
    },
  )

  it('rejects duplicate paths, encryption and truncated archive data', () => {
    const duplicate = zipSync({ a: new Uint8Array(), b: new Uint8Array() })
    const view = new DataView(duplicate.buffer)
    const second = centralOffset(duplicate, 1)
    duplicate[second + 46] = 'a'.charCodeAt(0)
    duplicate[view.getUint32(second + 42, true) + 30] = 'a'.charCodeAt(0)
    expect(() => readArchive(duplicate)).toThrow(/重复/u)
    const encrypted = zipSync({ a: new Uint8Array([1]) })
    new DataView(encrypted.buffer).setUint16(centralOffset(encrypted) + 8, 1, true)
    expect(() => readArchive(encrypted)).toThrow(/加密/u)
    expect(() => readArchive(encrypted.subarray(0, encrypted.length - 1))).toThrow(/损坏/u)
  })

  it('checks CRC integrity even when stored data still has the advertised size', () => {
    const bytes = zipSync({ data: [strToU8('original text'), { level: 0 }] })
    const view = new DataView(bytes.buffer)
    const dataStart = 30 + view.getUint16(26, true) + view.getUint16(28, true)
    bytes[dataStart] = (bytes[dataStart] ?? 0) ^ 1
    expect(() => readArchive(bytes)).toThrow(/完整性/u)
  })

  it('enforces compressed, entry count, individual and cumulative size bounds before decompression', () => {
    expect(() => readArchive(new Uint8Array(ARCHIVE_LIMITS.compressed + 1))).toThrow(/32 MiB/u)
    expect(() =>
      readArchive(
        zipSync(
          Object.fromEntries(
            Array.from({ length: 513 }, (_, index) => [`${index}`, new Uint8Array()]),
          ),
        ),
      ),
    ).toThrow(/512/u)
    expect(() =>
      readArchive(mutateSize(zipSync({ a: new Uint8Array() }), ARCHIVE_LIMITS.entry + 1)),
    ).toThrow(/10 MiB/u)
    expect(() =>
      readArchive(
        mutateSize(
          zipSync({
            a: new Uint8Array(),
            b: new Uint8Array(),
            c: new Uint8Array(),
            d: new Uint8Array(),
            e: new Uint8Array(),
            f: new Uint8Array(),
            g: new Uint8Array(),
            h: new Uint8Array(),
          }),
          9 * 1024 * 1024,
        ),
      ),
    ).toThrow(/64 MiB/u)
  })

  it('stops a compressed bomb whose metadata understates expanded output', () => {
    const bytes = zipSync({ bomb: new Uint8Array(ARCHIVE_LIMITS.entry + 1) })
    expect(() => readArchive(mutateSize(bytes, 1))).toThrow(/解压/u)
  })
})
