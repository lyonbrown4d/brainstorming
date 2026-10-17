import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createWorkbook, validateWorkbook } from '@core'
import { extensionFixture } from '@core/extension-test-fixture'
import { readArchive } from '@formats/archive'
import { decodeTrelyx, encodeTrelyx } from '@formats/trelyx/index'

/** A complete PCM WAV header plus one silent 16-bit sample, generated locally. */
const wavBytes = (): Uint8Array => {
  const bytes = new Uint8Array(46)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WAVEfmt '), 8)
  bytes.set(new TextEncoder().encode('data'), 36)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, 38, true)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  view.setUint32(40, 2, true)
  return bytes
}

const workbook = () => {
  const document = extensionFixture()
  const asset = document.assets?.voice
  if (!asset) throw new Error('Missing audio fixture')
  // Base64 content is canonical and independent from the MIME detector under test.
  const data = Array.from(wavBytes(), (byte) => String.fromCharCode(byte)).join('')
  return createWorkbook({ ...document, assets: { voice: { ...asset, data: btoa(data) } } })
}

describe('native local-feature extensions', () => {
  it('roundtrips metadata, annotations, layouts, floating positions, saved presentation and embedded audio', () => {
    const original = workbook()
    const encoded = encodeTrelyx(original)
    const entries = readArchive(encoded)
    expect(entries.get('assets/0/voice')).toEqual(wavBytes())
    const decoded = decodeTrelyx(encoded)
    expect(decoded).toEqual(original)
    const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json'))) as {
      version: number
    }
    expect(manifest.version).toBe(1)
    validateWorkbook(decoded)
  })

  it('preserves v1 audio attachments previously stored as opaque binary assets', () => {
    const original = workbook()
    const document = original.sheets[0]?.document
    const topic = document?.topics.a
    const asset = document?.assets?.voice
    if (!document || !topic || !asset) throw new Error('Missing fixture')
    const metadata = { ...topic.metadata }
    delete metadata.audioAssetId
    const legacy = createWorkbook({
      ...document,
      topics: { ...document.topics, a: { ...topic, metadata, attachments: ['voice'] } },
      assets: { voice: { ...asset, mimeType: 'application/octet-stream' } },
    })
    expect(decodeTrelyx(encodeTrelyx(legacy))).toEqual(legacy)
  })

  it('rejects unknown extension keys and dangling references from native JSON', () => {
    const original = workbook()
    const encoded = encodeTrelyx(original)
    for (const mutate of [
      (document: Record<string, unknown>) => {
        document.settings = { layout: 'map', unsupported: true }
      },
      (document: Record<string, unknown>) => {
        document.relations = [{ id: 'bad', from: 'root', to: 'missing' }]
      },
      (document: Record<string, unknown>) => {
        document.floatingPositions = { missing: { x: 0, y: 0 } }
      },
    ]) {
      const entries = Object.fromEntries(readArchive(encoded))
      const content = JSON.parse(new TextDecoder().decode(entries['document.json'])) as {
        sheets: { document: Record<string, unknown> }[]
      }
      const document = content.sheets[0]?.document
      if (!document) throw new Error('Missing serialized document')
      mutate(document)
      entries['document.json'] = strToU8(JSON.stringify(content))
      expect(() => decodeTrelyx(zipSync(entries))).toThrow()
    }
  })
})
