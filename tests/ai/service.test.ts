import { describe, expect, it, vi } from 'vitest'
import { generateMindMap, sdkGenerate } from '@main/ai/service'
import type { AIResult, AITree } from '@shared/ai'

const settings = {
  baseURL: 'https://service.example/v1',
  model: 'test-model',
  apiKey: 'fixture-private-key',
  structuredOutputs: true,
}
const request = {
  requestId: 'request-one',
  mode: 'expand',
  prompt: '整理产品计划',
  context: [{ title: '产品', depth: 0 }],
} as const
const tree: AITree = { title: '计划', children: [{ title: '研究', children: [] }] }
const response = (content: string): Response => {
  return new Response(
    JSON.stringify({
      id: 'chat-test',
      object: 'chat.completion',
      created: 1,
      model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
    { headers: { 'content-type': 'application/json' } },
  )
}

describe('AI SDK generation boundary', () => {
  it('uses the real compatible-provider SDK with structured JSON and mocked HTTP transport', async () => {
    const transport = vi.fn<typeof fetch>(() => Promise.resolve(response(JSON.stringify(tree))))
    const result = await generateMindMap(settings, request, new AbortController().signal, (input) =>
      sdkGenerate(input, transport),
    )
    expect(result).toEqual({ tree, topicCount: 2, inputTokens: 10, outputTokens: 20 })
    expect(transport).toHaveBeenCalledTimes(1)
    const init = transport.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-private-key')
    if (typeof init?.body !== 'string') throw new Error('SDK request body missing')
    const body: unknown = JSON.parse(init.body)
    expect(body).toMatchObject({
      model: 'test-model',
      max_tokens: 4096,
      response_format: { type: 'json_schema' },
    })
    expect(JSON.stringify(body)).toContain('整理产品计划')
    expect(JSON.stringify(body)).not.toContain('fixture-private-key')
  })
  it('rejects malformed model JSON and never exposes upstream response content or API keys in errors', async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(response('fixture-private-key <script> invalid JSON')),
    )
    const operation = generateMindMap(settings, request, new AbortController().signal, (input) =>
      sdkGenerate(input, transport),
    )
    await expect(operation).rejects.toThrow('AI 生成失败')
    await expect(operation).rejects.not.toThrow('fixture-private-key')
    const commands = vi.fn<typeof fetch>(() =>
      Promise.resolve(response(JSON.stringify({ ...tree, command: 'deleteAll' }))),
    )
    await expect(
      generateMindMap(settings, request, new AbortController().signal, (input) =>
        sdkGenerate(input, commands),
      ),
    ).rejects.toThrow('AI 生成失败')
  })
  it('supports local keyless JSON-mode providers while retaining client-side schema validation', async () => {
    const transport = vi.fn<typeof fetch>(() => Promise.resolve(response(JSON.stringify(tree))))
    const result = await generateMindMap(
      {
        baseURL: 'http://localhost:11434/v1',
        model: 'local-model',
        apiKey: '',
        structuredOutputs: false,
      },
      request,
      new AbortController().signal,
      (input) => sdkGenerate(input, transport),
    )
    expect(result.tree).toEqual(tree)
    const init = transport.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
    if (typeof init?.body !== 'string') throw new Error('SDK request body missing')
    expect(JSON.parse(init.body) as unknown).toMatchObject({
      response_format: { type: 'json_object' },
    })
  })
  it('post-validates a bounded tree and recomputes counts rather than trusting generated metadata', async () => {
    const result = await generateMindMap(settings, request, new AbortController().signal, () =>
      Promise.resolve({ tree, topicCount: 9000, inputTokens: -1, outputTokens: 1.5 }),
    )
    expect(result).toEqual({ tree, topicCount: 2, inputTokens: null, outputTokens: null })
    let deep = tree
    for (let depth = 0; depth < 8; depth++) deep = { title: '深', children: [deep] }
    await expect(
      generateMindMap(settings, request, new AbortController().signal, () =>
        Promise.resolve({ tree: deep, topicCount: 1, inputTokens: null, outputTokens: null }),
      ),
    ).rejects.toThrow('AI 生成失败')
  })
  it('cancels immediately even when an injected provider does not finish and rejects unconfigured remote calls', async () => {
    const controller = new AbortController()
    const generator = vi.fn(() => new Promise<AIResult>(() => undefined))
    const operation = generateMindMap(settings, request, controller.signal, generator)
    controller.abort()
    await expect(operation).rejects.toThrow('已取消')
    await expect(
      generateMindMap(
        { ...settings, apiKey: '' },
        request,
        new AbortController().signal,
        generator,
      ),
    ).rejects.toThrow('密钥')
    expect(generator).toHaveBeenCalledTimes(1)
  })
})
