import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AISettingsStore, type KeyStorage } from '@main/ai/settings'
import { validateEndpoint, validateRequest } from '@main/ai/validation'

const directories: string[] = []
const directory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'brainstorming-ai-'))
  directories.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const input = {
  baseURL: 'https://ai.example.com/v1',
  model: 'test-model',
  rememberKey: true,
  structuredOutputs: true,
}
const secureStorage = (): KeyStorage => {
  return {
    isEncryptionAvailable: () => true,
    encryptString: vi.fn(() => Buffer.from([1, 2, 3, 4])),
    decryptString: vi.fn(() => 'fixture-api-key'),
  }
}

describe('AI settings trust boundary', () => {
  it('waits for queued configuration changes before returning public settings or credentials', async () => {
    const store = new AISettingsStore(await directory(), secureStorage())
    await store.save({ ...input, apiKey: 'old-fixture-key' })
    const save = store.save({
      ...input,
      baseURL: 'https://new.example.com/v1',
      apiKey: 'new-fixture-key',
    })
    const publicRead = store.get()
    const privateRead = store.privateSettings()
    await save
    expect(await publicRead).toMatchObject({ baseURL: 'https://new.example.com/v1', hasKey: true })
    expect(await privateRead).toMatchObject({
      baseURL: 'https://new.example.com/v1',
      apiKey: 'new-fixture-key',
    })
  })
  it('stores only safeStorage ciphertext and returns settings with a key-presence flag', async () => {
    const path = await directory()
    const storage = secureStorage()
    const store = new AISettingsStore(path, storage)
    const settings = await store.save({ ...input, apiKey: 'fixture-api-key' })
    expect(settings).toMatchObject({
      hasKey: true,
      keyStorage: 'encrypted',
      baseURL: input.baseURL,
    })
    expect(JSON.stringify(settings)).not.toContain('fixture-api-key')
    expect(settings).not.toHaveProperty('apiKey')
    const file = await readFile(join(path, 'ai-settings.json'), 'utf8')
    expect(file).not.toContain('fixture-api-key')
    expect(JSON.parse(file)).toHaveProperty('encryptedKey')
    const restarted = new AISettingsStore(path, storage)
    expect(await restarted.get()).toMatchObject({ hasKey: true, keyStorage: 'encrypted' })
    expect((await restarted.privateSettings()).apiKey).toBe('fixture-api-key')
    await restarted.save({ ...input, clearKey: true })
    expect(await restarted.get()).toMatchObject({ hasKey: false, keyStorage: 'none' })
    expect(await readFile(join(path, 'ai-settings.json'), 'utf8')).not.toContain('encryptedKey')
  })
  it('keeps a key in memory only when Linux safeStorage falls back to basic_text', async () => {
    const path = await directory()
    const storage = { ...secureStorage(), getSelectedStorageBackend: () => 'basic_text' }
    const store = new AISettingsStore(path, storage)
    const settings = await store.save({ ...input, apiKey: 'fixture-memory-key' })
    expect(settings).toMatchObject({
      hasKey: true,
      keyStorage: 'memory',
    })
    expect(settings.notice).toContain('本次运行')
    expect(storage.encryptString).not.toHaveBeenCalled()
    expect(await readFile(join(path, 'ai-settings.json'), 'utf8')).not.toContain(
      'fixture-memory-key',
    )
    expect(await new AISettingsStore(path, storage).get()).toMatchObject({ hasKey: false })
  })
  it('clears credentials when an endpoint changes and recovers an invalid local settings file', async () => {
    const path = await directory()
    const store = new AISettingsStore(path, secureStorage())
    await store.save({ ...input, apiKey: 'fixture-api-key' })
    expect(await store.save({ ...input, baseURL: 'http://localhost:11434/v1' })).toMatchObject({
      hasKey: false,
    })
    await writeFile(join(path, 'ai-settings.json'), '{broken')
    const broken = new AISettingsStore(path, secureStorage())
    await expect(broken.get()).rejects.toThrow('无法读取')
    await expect(broken.save(input)).resolves.toMatchObject({ model: 'test-model' })
  })
  it.each([
    'http://example.com/v1',
    'file:///tmp/key',
    'https://user:secret@example.com/v1',
    'https://example.com/v1?key=secret',
    'https://example.com/v1#fragment',
    'http://localhost.evil.com/v1',
    'https://example.com/v1%2fsecret',
  ])('rejects unsafe endpoint %s', (endpoint) => {
    expect(() => validateEndpoint(endpoint)).toThrow()
  })
  it('accepts explicit local service endpoints and rejects malformed or oversized prompt data', () => {
    expect(validateEndpoint('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434/v1')
    expect(validateEndpoint('http://[::1]:1234/v1')).toBe('http://[::1]:1234/v1')
    expect(() =>
      validateRequest({ requestId: 'test', mode: 'expand', prompt: 'x'.repeat(4001), context: [] }),
    ).toThrow('4000')
    expect(() =>
      validateRequest({
        requestId: 'test',
        mode: 'expand',
        prompt: 'a',
        context: [{ title: 'x', depth: -1 }],
      }),
    ).toThrow('格式')
  })
})
