import {
  applyCommand,
  createDocument,
  createTopicClipboard,
  validateDocument,
  type MindMapDocument,
  type MindMapWorkbook,
  type Topic,
} from '@core'
import {
  AI_LIMITS,
  assertAITree,
  type AIContextTopic,
  type AIMode,
  type AITree,
} from '../../../../shared/ai'
import { useEditor } from '../../state/editor'
import { truncateSheetName } from '../../../../core/workbook'
import { validateBoundedWorkbook } from '../../../../formats/trelyx/validation'

export interface AISnapshot {
  readonly workbook: MindMapWorkbook
  readonly sheetId: string
  readonly targetId: string
}
export function captureAISnapshot(): AISnapshot {
  const state = useEditor.getState()
  state.commitDraft()
  const current = useEditor.getState()
  if (current.busy || current.editingId) throw new Error('请先完成当前编辑再使用 AI')
  return {
    workbook: current.workbook,
    sheetId: current.activeSheetId,
    targetId: current.selectedId,
  }
}
export function aiContext(snapshot: AISnapshot, includeNotes: boolean): AIContextTopic[] {
  const document = snapshot.workbook.sheets.find((sheet) => sheet.id === snapshot.sheetId)?.document
  if (!document) throw new Error('当前画布不存在')
  const result: AIContextTopic[] = []
  const pending = [{ id: snapshot.targetId, depth: 0 }]
  while (pending.length) {
    const item = pending.pop()
    if (!item) break
    const topic = document.topics[item.id]
    if (!topic) throw new Error('选定分支不存在')
    result.push({
      title: topic.title,
      depth: item.depth,
      ...(includeNotes && topic.notes ? { notes: topic.notes } : {}),
    })
    if (result.length > AI_LIMITS.topics || JSON.stringify(result).length > AI_LIMITS.context)
      throw new Error('选定分支超过 200 个主题或 12000 字符，请选择更小的分支')
    pending.push(...topic.children.map((id) => ({ id, depth: item.depth + 1 })).reverse())
  }
  return result
}
export function aiTreeDocument(tree: AITree): MindMapDocument {
  assertAITree(tree)
  const base = createDocument(tree.title, crypto.randomUUID())
  const topics: Record<string, Topic> = {}
  const visit = (node: AITree, isRoot = false): string => {
    const id = isRoot ? base.rootId : crypto.randomUUID()
    topics[id] = {
      id,
      title: node.title,
      children: node.children.map((child) => visit(child)),
      collapsed: false,
      side: 'right',
    }
    return id
  }
  visit(tree, true)
  const document = { ...base, topics }
  validateDocument(document)
  return document
}
export function applyAIResult(
  snapshot: AISnapshot,
  tree: AITree,
  mode: AIMode,
  addSheet: (document: MindMapDocument) => boolean,
): boolean {
  const state = useEditor.getState()
  if (
    state.workbook !== snapshot.workbook ||
    state.activeSheetId !== snapshot.sheetId ||
    state.editingId ||
    state.busy
  )
    throw new Error('生成期间文档或画布已改变，请重新生成后再应用')
  const generated = aiTreeDocument(tree)
  if (mode === 'generate') {
    validateBoundedWorkbook({
      ...state.workbook,
      sheets: [
        ...state.workbook.sheets,
        { id: generated.id, name: truncateSheetName(generated.title), document: generated },
      ],
    })
    return addSheet(generated)
  }
  if (!state.history.document.topics[snapshot.targetId]) throw new Error('生成目标主题已不存在')
  const clipboard = createTopicClipboard(generated, [generated.rootId])
  const command = {
    type: 'pasteTopics' as const,
    parentId: snapshot.targetId,
    clipboard,
    topicIds: Object.fromEntries(
      Object.keys(clipboard.topics).map((id) => [id, crypto.randomUUID()]),
    ),
    assetIds: {},
  }
  const document = applyCommand(state.history.document, command)
  validateBoundedWorkbook({
    ...state.workbook,
    sheets: state.workbook.sheets.map((sheet) =>
      sheet.id === snapshot.sheetId ? { ...sheet, document } : sheet,
    ),
  })
  return state.command(command)
}
