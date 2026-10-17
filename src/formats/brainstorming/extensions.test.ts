import { describe, expect, it } from 'vitest'
import { createWorkbook, validateWorkbook } from '@core'
import { extensionFixture } from '@core/extension-test-fixture'
import { mutateNative } from '@tests/formats/content-native-fixture'
import { decodeBrainstorming, encodeBrainstorming } from '@formats/brainstorming/index'

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
  return createWorkbook({
    ...document,
    assets: {
      voice: { id: asset.id, name: asset.name, mimeType: asset.mimeType, data: btoa(data) },
    },
  })
}

describe('native local-feature extensions', () => {
  it('roundtrips metadata, annotations, layouts, floating positions, saved presentation and embedded audio', async () => {
    const original = workbook()
    const decoded = await decodeBrainstorming(await encodeBrainstorming(original))
    expect(decoded).toEqual(original)
    validateWorkbook(decoded)
  })

  it('accepts audio attachments with an opaque binary MIME declaration', async () => {
    const original = workbook()
    const document = original.sheets[0]?.document
    const topic = document?.topics.a
    const asset = document?.assets?.voice
    if (!document || !topic || !asset) throw new Error('Missing fixture')
    const metadata = { ...topic.metadata }
    delete metadata.audioAssetId
    const binary = createWorkbook({
      ...document,
      topics: { ...document.topics, a: { ...topic, metadata, attachments: ['voice'] } },
      assets: { voice: { ...asset, mimeType: 'application/octet-stream' } },
    })
    expect(await decodeBrainstorming(await encodeBrainstorming(binary))).toEqual(binary)
  })

  it('rejects unknown extension keys and dangling references from native SQLite', async () => {
    for (const sql of [
      `UPDATE sheets SET metadata = json_set(metadata,'$.settings.unsupported',1)`,
      `UPDATE relations SET data = json_set(data,'$.to','missing')`,
      `UPDATE sheets SET metadata = json_set(metadata,'$.floatingPositions.missing',json('{"x":0,"y":0}'))`,
    ]) {
      const bytes = await mutateNative(workbook(), (db) => {
        db.exec(sql)
      })
      await expect(decodeBrainstorming(bytes)).rejects.toThrow()
    }
  })
})
