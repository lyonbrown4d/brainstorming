import { filetypeinfo } from 'magic-bytes.js'
import { AUDIO_MIME_TYPES } from '@core/topic-content'

const mimeAliases: Readonly<Record<string, string>> = {
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'video/mp4': 'audio/mp4',
  'video/webm': 'audio/webm',
  'application/ogg': 'audio/ogg',
  'audio/opus': 'audio/ogg',
  'audio/x-aac': 'audio/aac',
}
const supported = new Set<string>(AUDIO_MIME_TYPES)

/** Detect containers with upstream signatures; actual playback decoding belongs to the browser. */
export const audioMime = (bytes: Uint8Array): string | undefined => {
  const guesses = filetypeinfo(bytes.subarray(0, 4096))
  if (guesses.some(({ mime }) => mime?.startsWith('image/'))) return undefined
  for (const guess of guesses) {
    if (guess.mime === undefined) continue
    const mime = mimeAliases[guess.mime] ?? guess.mime
    if (supported.has(mime)) return mime
  }
  return undefined
}
