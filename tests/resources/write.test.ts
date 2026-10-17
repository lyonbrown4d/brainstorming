import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { writeResourceFile } from '@main/resources/write'

const chunks = (fail = false): AsyncIterable<Uint8Array> => ({
  [Symbol.asyncIterator]: () => {
    let position = 0
    return {
      next: () => {
        position += 1
        if (position === 2 && fail) return Promise.reject(new Error('source failed'))
        return Promise.resolve(
          position <= 2
            ? { done: false as const, value: Buffer.from(`chunk${position}`) }
            : { done: true as const, value: undefined },
        )
      },
    }
  },
})

it('finishes, flushes and closes the streamed export before replacing the target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-export-'))
  try {
    const path = join(directory, 'export.bin')
    await writeFile(path, 'existing')
    await writeResourceFile(path, chunks())
    expect(await readFile(path, 'utf8')).toBe('chunk1chunk2')
    expect(await readdir(directory)).toEqual(['export.bin'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
it('preserves the old target and removes a partial export when its source fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-export-'))
  try {
    const path = join(directory, 'export.bin')
    await writeFile(path, 'existing')
    await expect(writeResourceFile(path, chunks(true))).rejects.toThrow('source failed')
    expect(await readFile(path, 'utf8')).toBe('existing')
    expect(await readdir(directory)).toEqual(['export.bin'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
