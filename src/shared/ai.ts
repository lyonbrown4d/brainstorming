export const AI_LIMITS = {
  prompt: 4000,
  context: 12000,
  topics: 200,
  depth: 8,
  title: 200,
  children: 32,
  responseBytes: 128 * 1024,
  tokens: 4096,
  timeout: 30000,
} as const
export type AIMode = 'generate' | 'expand' | 'organize'
export interface AITree {
  readonly title: string
  readonly children: readonly AITree[]
}
export interface AIContextTopic {
  readonly title: string
  readonly notes?: string
  readonly depth: number
}
export interface AISettings {
  readonly baseURL: string
  readonly model: string
  readonly hasKey: boolean
  readonly keyStorage: 'encrypted' | 'memory' | 'none'
  readonly rememberKey: boolean
  readonly structuredOutputs: boolean
  readonly notice: string | null
}
export interface AISettingsInput {
  readonly baseURL: string
  readonly model: string
  readonly apiKey?: string
  readonly clearKey?: boolean
  readonly rememberKey: boolean
  readonly structuredOutputs: boolean
}
export interface AIGenerateRequest {
  readonly requestId: string
  readonly mode: AIMode
  readonly prompt: string
  readonly context: readonly AIContextTopic[]
}
export interface AIResult {
  readonly tree: AITree
  readonly topicCount: number
  readonly inputTokens: number | null
  readonly outputTokens: number | null
}
export interface AIAPI {
  getAISettings(): Promise<AISettings>
  saveAISettings(settings: AISettingsInput): Promise<AISettings>
  generateMindMap(request: AIGenerateRequest): Promise<AIResult>
  cancelAIGeneration(requestId: string): Promise<void>
}
export const assertAITree: (value: unknown) => asserts value is AITree = (
  value: unknown,
): asserts value is AITree => {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 1 }]
  const visited = new Set<object>()
  let count = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item?.value || typeof item.value !== 'object' || Array.isArray(item.value))
      throw new Error('AI 结果包含无效主题')
    const node = item.value as Record<string, unknown>
    if (visited.has(node) || ++count > AI_LIMITS.topics || item.depth > AI_LIMITS.depth)
      throw new Error('AI 结果超过 200 个主题或 8 层限制')
    visited.add(node)
    if (
      Object.keys(node).some((key) => !['title', 'children'].includes(key)) ||
      typeof node.title !== 'string' ||
      !node.title.trim() ||
      node.title.length > AI_LIMITS.title ||
      !Array.isArray(node.children) ||
      node.children.length > AI_LIMITS.children
    )
      throw new Error('AI 主题标题或子主题格式无效')
    for (const child of node.children)
      pending.push({ value: child as unknown, depth: item.depth + 1 })
  }
}
