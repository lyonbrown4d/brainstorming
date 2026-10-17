import { z } from 'zod'
import { AI_LIMITS, assertAITree, type AITree } from '@shared/ai'
import { createDocument, validateDocument, type MindMapDocument, type Topic } from '@core'

const title = z.string().trim().min(1).max(AI_LIMITS.title)
// Recursive references are supported by OpenAI structured outputs. Depth and total count
// are checked iteratively before any generated result becomes an application document.
export const aiTreeSchema: z.ZodType<AITree> = z
  .object({
    title,
    children: z.array(z.lazy(() => aiTreeSchema)).max(AI_LIMITS.children),
  })
  .strict()
export const aiDocument = (value: unknown): MindMapDocument => {
  assertAITree(value)
  const base = createDocument(value.title, crypto.randomUUID())
  const topics: Record<string, Topic> = {}
  const visit = (tree: AITree, root = false): string => {
    const id = root ? base.rootId : crypto.randomUUID()
    topics[id] = {
      id,
      title: tree.title,
      children: tree.children.map((child) => visit(child)),
      collapsed: false,
      side: 'right',
    }
    return id
  }
  visit(value, true)
  const document = { ...base, topics }
  validateDocument(document)
  return document
}
