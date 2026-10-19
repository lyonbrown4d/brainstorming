import { validateWorkbook } from '@core'
import { translate } from '@renderer/i18n'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import {
  applyCommand,
  createTopicClipboard,
  getParentId,
  validateTopicClipboard,
  type TopicClipboard,
} from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, setSelectedTopics } from '@renderer/state/selection'

export const TOPIC_CLIPBOARD_PREFIX = 'Brainstorming topics v1\n'
const MAX_CLIPBOARD_BYTES = 56 * 1024 * 1024
const MAX_TOPIC_BYTES = 10 * 1024 * 1024
let pending = false

export const parseTopicClipboard = (contents: string): TopicClipboard => {
  if (new TextEncoder().encode(contents).byteLength > MAX_CLIPBOARD_BYTES)
    throw new Error(translate('clipboardContentIsTooLarge'))
  if (!contents.startsWith(TOPIC_CLIPBOARD_PREFIX))
    throw new Error(translate('noBrainstormingTopicsInTheClipboardCopy'))
  const value: unknown = JSON.parse(contents.slice(TOPIC_CLIPBOARD_PREFIX.length))
  validateTopicClipboard(value)
  if (
    new TextEncoder().encode(JSON.stringify({ ...value, assets: undefined })).byteLength >
    MAX_TOPIC_BYTES
  )
    throw new Error(translate('clipboardTopicContentExceeds10Mib'))
  return value
}

const report = (error: unknown): void => {
  useEditor
    .getState()
    .setError(error instanceof Error ? error.message : translate('clipboardOperationFailed'))
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
    state.setError(translate('theSheetOrSelectionChangedDuringClipboard'))
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

const pastePayload = (
  source: TopicClipboard,
  before: NonNullable<ReturnType<typeof capture>>,
  parentId: string,
): void => {
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
  validateWorkbook({
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
        .setError(
          translate('topicsPastedRemovedValue0CrosssheetLinksMissing', { value0: omittedLinks }),
        )
  }
}

export const copySelectedTopics = async (cut = false): Promise<void> => {
  if (pending) return
  const before = capture()
  if (!before) return
  const ids = selectedTopicIds(before)
  if (!ids.length) return
  if (cut && ids.includes(before.history.document.rootId)) {
    before.setError(translate('theCentralTopicCannotBeCutYou'))
    return
  }
  pending = true
  try {
    const clipboard = createTopicClipboard(before.history.document, ids)
    const contents = TOPIC_CLIPBOARD_PREFIX + JSON.stringify(clipboard)
    parseTopicClipboard(contents)
    await requireDesktopAPI().writeTopicClipboard(contents, plainText(clipboard))
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
    const contents = await requireDesktopAPI().readTopicClipboard()
    if (!unchanged(before)) return
    pastePayload(parseTopicClipboard(contents), before, before.selectedId)
  } catch (error) {
    report(error)
  } finally {
    pending = false
  }
}

export const duplicateSelectedTopics = (): void => {
  if (pending) return
  const before = capture()
  if (!before?.selectedTopics.length) return
  pending = true
  try {
    const clipboard = createTopicClipboard(before.history.document, selectedTopicIds(before))
    const parentId =
      getParentId(before.history.document, clipboard.roots[0] ?? '') ?? before.selectedId
    pastePayload(clipboard, before, parentId)
  } catch (error) {
    report(error)
  } finally {
    pending = false
  }
}
