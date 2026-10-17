import { filetypeinfo } from 'magic-bytes.js'
import { audioMime } from '@assets/audio'
export const sniffMedia = (bytes: Uint8Array, preferAudio = false): string => {
  if (preferAudio) {
    const audio = audioMime(bytes)
    if (audio) return audio
  }
  const starts = (values: number[]) => values.every((value, index) => bytes[index] === value)
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png'
  if (starts([255, 216, 255])) return 'image/jpeg'
  const text = new TextDecoder('latin1').decode(bytes.slice(0, 64))
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp'
  const guesses = filetypeinfo(bytes)
  const detected =
    guesses.find((value) => value.mime?.startsWith('image/'))?.mime ??
    (guesses.some((value) => value.mime === 'audio/webm' || value.mime === 'video/webm')
      ? 'video/webm'
      : undefined) ??
    guesses.find((value) => value.mime?.startsWith('video/'))?.mime
  // AVIF shares ISO-BMFF's ftyp box with MP4; honor raster signatures before the video fallback.
  if (detected?.startsWith('image/')) return detected
  if (text.slice(4, 8) === 'ftyp' && !text.slice(8, 32).includes('M4A')) return 'video/mp4'
  return detected ?? audioMime(bytes) ?? 'application/octet-stream'
}
