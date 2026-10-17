import {
  applyCommand,
  createTopicClipboard,
  getParentId,
  validateTopicClipboard,
  type TopicClipboard,
} from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, setSelectedTopics } from '@renderer/state/selection'

export const TOPIC_CLIPBOARD_PREFIX = 'Trelyx topics v1\n'
const MAX_CLIPBOARD_BYTES = 56 * 1024 * 1024
const MAX_TOPIC_BYTES = 10 * 1024 * 1024
let pending = false

export const parseTopicClipboard = (contents: string): TopicClipboard => {
  if (new TextEncoder().encode(contents).byteLength > MAX_CLIPBOARD_BYTES)
    throw new Error('剪贴板内容过大')
  if (!contents.startsWith(TOPIC_CLIPBOARD_PREFIX))
    throw new Error('剪贴板中没有 Trelyx 主题，请先复制主题分支')
  const value: unknown = JSON.parse(contents.slice(TOPIC_CLIPBOARD_PREFIX.length))
  validateTopicClipboard(value)
  if (
    new TextEncoder().encode(JSON.stringify({ ...value, assets: undefined })).byteLength >
    MAX_TOPIC_BYTES
  )
    throw new Error('剪贴板主题内容超过 10 MiB')
  return value
}

const report = (error: unknown): void => {
  useEditor.getState().setError(error instanceof Error ? error.message : '剪贴板操作失败')
}
const capture = () => {
  const state = useEditor.getState()
  state.commitDraft()
  const current = useEditor.getState()
  if (current.editingId || current.busy) return null
  return { ...current, selectedTopics: selectedTopicIds(current) }
}
const unchanged = (before: NonNullable<ReturnType<typeof capture>>): boolean => {
  const state = useEditor.getState()
  if (
    state.workbook !== before.workbook ||
    state.activeSheetId !== before.activeSheetId ||
    state.selectedId !== before.selectedId ||
    JSON.stringify(selectedTopicIds(state)) !== JSON.stringify(before.selectedTopics) ||
    state.editingId !== null ||
    state.busy
  ) {
    state.setError('剪贴板操作期间画布或选择已改变，请重试')
    return false
  }
  return true
}
const plainText = (clipboard: TopicClipboard): string => {
  const lines: string[] = []
  const stack = clipboard.roots.map((id) => ({ id, depth: 0 })).reverse()
  while (stack.length) {
    const item = stack.pop()
    if (!item) break
    const topic = clipboard.topics[item.id]
    if (!topic) continue
    lines.push(`${'\t'.repeat(item.depth)}${topic.title}`)
    stack.push(...topic.children.map((id) => ({ id, depth: item.depth + 1 })).reverse())
  }
  return lines.join('\n')
}

const pastePayload = async (
  source: TopicClipboard,
  before: NonNullable<ReturnType<typeof capture>>,
  parentId: string,
): Promise<void> => {
  let omittedLinks = 0
  const clipboard: TopicClipboard = {
    ...source,
    topics: Object.fromEntries(
      Object.entries(source.topics).map(([id, topic]) => {
        const link = topic.metadata?.link
        if (
          link?.kind !== 'topic' ||
          link.sheetId === undefined ||
          before.workbook.sheets.some(
            (sheet) => sheet.id === link.sheetId && sheet.document.topics[link.topicId],
          )
        )
          return [id, topic]
        const metadata = { ...topic.metadata }
        delete metadata.link
        omittedLinks += 1
        return [id, { ...topic, metadata }]
      }),
    ),
  }
  const topicIds = Object.fromEntries(
    Object.keys(clipboard.topics).map((id) => [id, crypto.randomUUID()]),
  )
  const assetIds = Object.fromEntries(
    Object.keys(clipboard.assets ?? {}).map((id) => [id, crypto.randomUUID()]),
  )
  const annotationIds = Object.fromEntries(
    [
      ...(clipboard.relations ?? []),
      ...(clipboard.groups ?? []),
      ...(clipboard.callouts ?? []),
    ].map((annotation) => [annotation.id, crypto.randomUUID()]),
  )
  const command = {
    type: 'pasteTopics' as const,
    parentId,
    clipboard,
    topicIds,
    assetIds,
    annotationIds,
  }
  const document = applyCommand(before.history.document, command)
  const { encodeTrelyx } = await import('@formats/trelyx')
  encodeTrelyx({
    ...before.workbook,
    sheets: before.workbook.sheets.map((sheet) =>
      sheet.id === before.activeSheetId ? { ...sheet, document } : sheet,
    ),
  })
  if (!unchanged(before)) return
  if (useEditor.getState().command(command)) {
    setSelectedTopics(clipboard.roots.flatMap((id) => (topicIds[id] ? [topicIds[id]] : [])))
    if (omittedLinks)
      useEditor
        .getState()
        .setError(`已粘贴主题；目标文档中不存在的跨画布链接已移除（${omittedLinks} 项）`)
  }
}

export const copySelectedTopics = async (cut = false): Promise<void> => {
  if (pending) return
  const before = capture()
  if (!before) return
  const ids = selectedTopicIds(before)
  if (cut && ids.includes(before.history.document.rootId)) {
    before.setError('中心主题不能剪切；可以复制整个导图')
    return
  }
  pending = true
  try {
    const clipboard = createTopicClipboard(before.history.document, ids)
    const contents = TOPIC_CLIPBOARD_PREFIX + JSON.stringify(clipboard)
    parseTopicClipboard(contents)
    if (window.trelyx) await window.trelyx.writeTopicClipboard(contents, plainText(clipboard))
    else await navigator.clipboard.writeText(contents)
    if (!unchanged(before)) return
    if (cut) {
      const parent = getParentId(before.history.document, clipboard.roots[0] ?? '')
      if (!useEditor.getState().command({ type: 'deleteTopics', topicIds: clipboard.roots })) return
      setSelectedTopics([parent ?? before.history.document.rootId])
    }
    useEditor.getState().setError(null)
  } catch (error) {
    report(error)
  } finally {
    pending = false
  }
}

export const pasteSelectedTopics = async (): Promise<void> => {
  if (pending) return
  const before = capture()
  if (!before) return
  pending = true
  try {
    const contents = window.trelyx
      ? await window.trelyx.readTopicClipboard()
      : await navigator.clipboard.readText()
    if (!unchanged(before)) return
    await pastePayload(parseTopicClipboard(contents), before, before.selectedId)
  } catch (error) {
    report(error)
  } finally {
    pending = false
  }
}

export const duplicateSelectedTopics = async (): Promise<void> => {
  if (pending) return
  const before = capture()
  if (!before) return
  pending = true
  try {
    const clipboard = createTopicClipboard(before.history.document, selectedTopicIds(before))
    const parentId =
      getParentId(before.history.document, clipboard.roots[0] ?? '') ?? before.selectedId
    await pastePayload(clipboard, before, parentId)
  } catch (error) {
    report(error)
  } finally {
    pending = false
  }
}
