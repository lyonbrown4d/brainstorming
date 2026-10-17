import { desktop } from '@tests/fixtures/desktop'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createTopicClipboard } from '@core'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, setSelectedTopics } from '@renderer/state/selection'
import {
  copySelectedTopics,
  duplicateSelectedTopics,
  parseTopicClipboard,
  pasteSelectedTopics,
  TOPIC_CLIPBOARD_PREFIX,
} from '@renderer/state/clipboard'

const fixture = () => {
  let document = applyCommand(createDocument('中心'), {
    type: 'addTopic',
    id: 'a',
    parentId: 'root',
    title: '分支',
    side: 'right',
  })
  document = applyCommand(document, {
    type: 'addTopic',
    id: 'b',
    parentId: 'a',
    title: '子主题',
    side: 'right',
  })
  document = applyCommand(document, { type: 'setTopicNotes', topicId: 'a', notes: '保留备注' })
  return applyCommand(document, {
    type: 'addTopicAttachment',
    topicId: 'a',
    asset: { id: 'file', name: '说明.txt', mimeType: 'application/octet-stream', data: 'YWJj' },
  })
}
const writeClipboard = vi.fn((value: string) => {
  contents = value
  return Promise.resolve()
})
const readClipboard = vi.fn(() => Promise.resolve(contents))
let contents = ''
beforeEach(() => {
  contents = ''
  writeClipboard.mockReset().mockImplementation((value: string) => {
    contents = value
    return Promise.resolve()
  })
  readClipboard.mockReset().mockImplementation(() => Promise.resolve(contents))
  useEditor.getState().replace(fixture())
  useEditor.setState({ busy: false })
  setSelectedTopics(['a'])
  vi.stubGlobal('window', {
    trelyx: desktop({
      writeTopicClipboard: writeClipboard,
      readTopicClipboard: readClipboard,
    }),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('系统主题剪贴板', () => {
  it('复制粘贴跨文档保留子树、备注和资源，所有标识重新生成且一次撤销', async () => {
    await copySelectedTopics()
    expect(writeClipboard).toHaveBeenCalledWith(
      expect.stringContaining(TOPIC_CLIPBOARD_PREFIX),
      '分支\n\t子主题',
    )
    useEditor.getState().replace(createDocument('目标'))
    await pasteSelectedTopics()
    const state = useEditor.getState()
    expect(state.error).toBeNull()
    expect(Object.keys(state.history.document.topics)).toHaveLength(3)
    expect(state.history.document.topics.a).toBeUndefined()
    const pasted = state.history.document.topics[state.selectedId]
    expect(pasted?.title).toBe('分支')
    expect(pasted?.notes).toBe('保留备注')
    expect(pasted?.children).toHaveLength(1)
    expect(pasted?.attachments?.[0]).not.toBe('file')
    expect(Object.values(state.history.document.assets ?? {})[0]?.data).toBe('YWJj')
    expect(state.history.past).toHaveLength(1)
    state.undo()
    expect(Object.keys(useEditor.getState().history.document.topics)).toEqual(['root'])
  })
  it('缺少桌面桥接时不使用浏览器剪贴板，也不删除选中的主题', async () => {
    vi.stubGlobal('window', {})
    const browserRead = vi.fn(() => Promise.resolve(contents))
    const browserWrite = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { readText: browserRead, writeText: browserWrite } })
    const before = useEditor.getState().history
    await copySelectedTopics(true)
    expect(useEditor.getState().history).toBe(before)
    expect(useEditor.getState().error).toContain('Electron')
    await pasteSelectedTopics()
    expect(useEditor.getState().history).toBe(before)
    expect(browserRead).not.toHaveBeenCalled()
    expect(browserWrite).not.toHaveBeenCalled()
  })
  it('写入失败不剪切，异步读取期间切换文档不覆盖当前内容', async () => {
    const before = useEditor.getState().history.document
    writeClipboard.mockRejectedValueOnce(new Error('剪贴板不可用'))
    await copySelectedTopics(true)
    expect(useEditor.getState().history.document).toBe(before)
    expect(useEditor.getState().error).toBe('剪贴板不可用')
    let finish: ((value: string) => void) | undefined
    readClipboard.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const paste = pasteSelectedTopics()
    useEditor.getState().replace(createDocument('保持此文档'))
    finish?.(TOPIC_CLIPBOARD_PREFIX + JSON.stringify(createTopicClipboard(before, ['a'])))
    await paste
    expect(useEditor.getState().history.document.title).toBe('保持此文档')
    expect(Object.keys(useEditor.getState().history.document.topics)).toHaveLength(1)
  })
  it('成功剪切一次删除后可撤销，副本插入同级且不写入系统剪贴板', async () => {
    await duplicateSelectedTopics()
    const current = useEditor.getState()
    expect(current.error).toBeNull()
    expect(current.history.document.topics.root?.children).toHaveLength(2)
    expect(writeClipboard).not.toHaveBeenCalled()
    expect(selectedTopicIds(current)).toEqual([current.selectedId])
    await copySelectedTopics(true)
    expect(useEditor.getState().history.document.topics.root?.children).toEqual(['a'])
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.root?.children).toHaveLength(2)
  })
  it('拒绝普通文本与损坏结构，粘贴失败保留当前历史', async () => {
    expect(() => parseTopicClipboard('普通文本')).toThrow('Trelyx')
    const before = useEditor.getState().history
    contents =
      TOPIC_CLIPBOARD_PREFIX +
      JSON.stringify({ format: 'trelyx.topics', version: 1, roots: ['missing'], topics: {} })
    await pasteSelectedTopics()
    expect(useEditor.getState().history).toBe(before)
    expect(useEditor.getState().error).toBeTruthy()
  })
})

it('跨工作簿粘贴移除无目标的跨画布链接，仍保留内容、资源和一次撤销', async () => {
  const current = useEditor.getState()
  current.addSheet()
  const otherSheetId = useEditor.getState().activeSheetId
  const firstSheetId = current.activeSheetId
  useEditor.getState().switchSheet(firstSheetId)
  useEditor.getState().command({
    type: 'setTopicMetadata',
    topicId: 'a',
    metadata: {
      labels: ['保留标签'],
      link: { kind: 'topic', sheetId: otherSheetId, topicId: 'root' },
    },
  })
  setSelectedTopics(['a'])
  await copySelectedTopics()
  useEditor.getState().replace(createDocument('目标'))
  await pasteSelectedTopics()
  const state = useEditor.getState()
  expect(state.history.past).toHaveLength(1)
  expect(state.history.document.topics[state.selectedId]?.metadata).toEqual({
    labels: ['保留标签'],
  })
  expect(state.history.document.topics[state.selectedId]?.notes).toBe('保留备注')
  expect(Object.values(state.history.document.assets ?? {})[0]?.data).toBe('YWJj')
  expect(state.error).toContain('跨画布链接已移除')
})

it('同一工作簿内粘贴保留可解析的跨画布主题链接', async () => {
  const firstSheetId = useEditor.getState().activeSheetId
  useEditor.getState().addSheet()
  const otherSheetId = useEditor.getState().activeSheetId
  useEditor.getState().switchSheet(firstSheetId)
  const link = { kind: 'topic' as const, sheetId: otherSheetId, topicId: 'root' }
  useEditor.getState().command({ type: 'setTopicMetadata', topicId: 'a', metadata: { link } })
  setSelectedTopics(['a'])
  await copySelectedTopics()
  await pasteSelectedTopics()
  const state = useEditor.getState()
  expect(state.error).toBeNull()
  expect(state.history.document.topics[state.selectedId]?.metadata?.link).toEqual(link)
})
