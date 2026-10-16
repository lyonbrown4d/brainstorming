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
