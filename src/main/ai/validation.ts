import { AI_LIMITS, type AIGenerateRequest, type AISettingsInput } from '@shared/ai'

export const object = (value: unknown): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error('AI 请求格式无效')
  return value as Record<string, unknown>
}
export const validateEndpoint = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 2048 || /[\p{Cc}]/u.test(value))
    throw new Error('AI 服务地址无效')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('请输入完整 AI 服务地址')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /%(?:2f|5c|00)/i.test(url.pathname)
  )
    throw new Error('AI 地址须使用 HTTPS，本机服务可使用 HTTP；不可包含凭据、查询参数或片段')
  return url.href.replace(/\/+$/, '')
}
export const validateSettings = (value: unknown): AISettingsInput => {
  const input = object(value)
  if (
    Object.keys(input).some(
      (key) =>
        !['baseURL', 'model', 'apiKey', 'clearKey', 'rememberKey', 'structuredOutputs'].includes(
          key,
        ),
    )
  )
    throw new Error('AI 设置包含未知字段')
  const baseURL = validateEndpoint(input.baseURL)
  if (
    typeof input.model !== 'string' ||
    !input.model.trim() ||
    input.model.length > 120 ||
    /[\p{Cc}]/u.test(input.model)
  )
    throw new Error('模型名称须为 1 至 120 个字符')
  if (
    typeof input.rememberKey !== 'boolean' ||
    typeof input.structuredOutputs !== 'boolean' ||
    (input.clearKey !== undefined && typeof input.clearKey !== 'boolean')
  )
    throw new Error('AI 设置格式无效')
  if (
    input.apiKey !== undefined &&
    (typeof input.apiKey !== 'string' ||
      input.apiKey.length > 4096 ||
      /[\p{Cc}]/u.test(input.apiKey))
  )
    throw new Error('API 密钥格式无效')
  return {
    baseURL,
    model: input.model.trim(),
    rememberKey: input.rememberKey,
    structuredOutputs: input.structuredOutputs,
    ...(typeof input.apiKey === 'string' ? { apiKey: input.apiKey } : {}),
    ...(typeof input.clearKey === 'boolean' ? { clearKey: input.clearKey } : {}),
  }
}
export const validateRequest = (value: unknown): AIGenerateRequest => {
  const input = object(value)
  if (Object.keys(input).some((key) => !['requestId', 'mode', 'prompt', 'context'].includes(key)))
    throw new Error('AI 请求包含未知字段')
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.requestId))
    throw new Error('AI 请求标识无效')
  if (!['generate', 'expand', 'organize'].includes(String(input.mode)))
    throw new Error('AI 操作模式无效')
  if (
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > AI_LIMITS.prompt
  )
    throw new Error('AI 提示须为 1 至 4000 个字符')
  if (
    !Array.isArray(input.context) ||
    input.context.length > AI_LIMITS.topics ||
    JSON.stringify(input.context).length > AI_LIMITS.context
  )
    throw new Error('AI 分支上下文超过限制')
  const context = input.context.map((entry: unknown) => {
    const topic = object(entry)
    if (
      Object.keys(topic).some((key) => !['title', 'notes', 'depth'].includes(key)) ||
      typeof topic.title !== 'string' ||
      topic.title.length > AI_LIMITS.context ||
      typeof topic.depth !== 'number' ||
      !Number.isInteger(topic.depth) ||
      topic.depth < 0 ||
      topic.depth >= 128 ||
      (topic.notes !== undefined && typeof topic.notes !== 'string')
    )
      throw new Error('AI 分支内容格式无效')
    return {
      title: topic.title,
      depth: topic.depth,
      ...(typeof topic.notes === 'string' ? { notes: topic.notes } : {}),
    }
  })
  return {
    requestId: input.requestId,
    mode: input.mode as AIGenerateRequest['mode'],
    prompt: input.prompt,
    context,
  }
}
