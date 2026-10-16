import { AI_LIMITS } from '../../shared/ai'

/** Requests are limited to the configured origin/path; redirects never forward the API key. */
export function boundedAIFetch(endpoint: string, transport: typeof fetch = fetch): typeof fetch {
  const expected = new URL(`${endpoint}/chat/completions`)
  return async (input, init) => {
    const target = input instanceof Request ? new URL(input.url) : new URL(input.toString())
    if (
      target.href !== expected.href ||
      (init?.method ?? (input instanceof Request ? input.method : 'GET')) !== 'POST'
    )
      throw new Error('AI 请求目标不符合服务配置')
    const response = await transport(input, { ...init, redirect: 'error' })
    const length = response.headers.get('content-length')
    if (length !== null && Number(length) > AI_LIMITS.responseBytes) {
      await response.body?.cancel()
      throw new Error('AI 响应超过 128 KiB 限制')
    }
    if (!response.body) return response
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        init?.signal?.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > AI_LIMITS.responseBytes) throw new Error('AI 响应超过 128 KiB 限制')
        chunks.push(value)
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
