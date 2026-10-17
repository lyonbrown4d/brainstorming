import type { MindMapDocument, Topic } from '@core/types'
import { createDocument } from '@core/document'

/** Fixed inputs for Storybook and repeatable 100 / 1,000 / 5,000-topic performance sampling. */
export const createFixtureDocument = (
  count: number,
  shape: 'balanced' | 'deep' = 'balanced',
): MindMapDocument => {
  if (!Number.isInteger(count) || count < 1) throw new Error('Fixture 主题数量必须是正整数')
  const document = createDocument('性能测试', `fixture-${shape}-${count}`)
  const topics: Record<string, Topic> = { ...document.topics }
  const children = new Map<string, string[]>([['root', []]])
  for (let index = 1; index < count; index += 1) {
    const id = `topic-${index}`
    const parentIndex = shape === 'deep' ? index - 1 : Math.floor((index - 1) / 4)
    const parentId = parentIndex === 0 ? 'root' : `topic-${parentIndex}`
    const parent = topics[parentId]
    if (!parent) throw new Error('Fixture 父主题缺失')
    const side = parentId === 'root' ? (index % 2 === 0 ? 'left' : 'right') : parent.side
    topics[id] = {
      id,
      title:
        index % 9 === 0
          ? `主题 ${index}：这是一段用于验证自动换行与分支间距的较长文本`
          : `主题 ${index}`,
      children: [],
      collapsed: false,
      side,
    }
    children.set(id, [])
    children.get(parentId)?.push(id)
  }
  for (const [id, ids] of children) {
    const topic = topics[id]
    if (topic) topics[id] = { ...topic, children: ids }
  }
  return { ...document, topics }
}
