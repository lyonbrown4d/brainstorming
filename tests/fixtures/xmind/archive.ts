import { readFileSync } from 'node:fs'
import { zipSync } from 'fflate'

function fixture(name: string): Uint8Array {
  return readFileSync(new URL(name, import.meta.url))
}

/** Authored modern XMind fixture with Chinese titles, two sheets and unsupported features. */
export function modernXmind(): Uint8Array {
  return zipSync({ 'content.json': fixture('modern.json') })
}

/** Authored legacy XMind fixture with referenced styles and namespace-prefixed XML. */
export function legacyXmind(): Uint8Array {
  return zipSync({ 'content.xml': fixture('legacy.xml'), 'styles.xml': fixture('styles.xml') })
}

/** Embedded content fixtures use actual PNG and arbitrary attachment bytes inside ZIP. */
export function contentXmind(legacy = false): Uint8Array {
  return zipSync({
    [legacy ? 'content.xml' : 'content.json']: fixture(
      legacy ? 'content-legacy.xml' : 'content-modern.json',
    ),
    'resources/pixel image.png': fixture('pixel image.png'),
    'attachments/data.bin': fixture('data.bin'),
  })
}
