import { describe, expect, it, vi } from 'vitest'
import { boundedAIFetch } from '@main/ai/transport'

describe('AI response transport bounds', () => {
  it('only sends POST to the configured completion endpoint and disables redirects', async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
      ),
    )
    const request = boundedAIFetch('https://service.example/v1', transport)
    expect(
      await (
        await request('https://service.example/v1/chat/completions', { method: 'POST' })
      ).json(),
    ).toEqual({ ok: true })
    expect(transport).toHaveBeenCalledWith(
      'https://service.example/v1/chat/completions',
      expect.objectContaining({ redirect: 'error' }),
    )
    await expect(
      request('https://other.example/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow('目标')
    await expect(
      request('https://service.example/v1/chat/completions', { method: 'GET' }),
    ).rejects.toThrow('目标')
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('rejects responses above the limit even when Content-Length is absent', async () => {
    const request = boundedAIFetch('http://localhost:11434/v1', () =>
      Promise.resolve(new Response('x'.repeat(128 * 1024 + 1))),
    )
    await expect(
      request('http://localhost:11434/v1/chat/completions', { method: 'POST' }),
    ).rejects.toThrow('128 KiB')
  })
})
