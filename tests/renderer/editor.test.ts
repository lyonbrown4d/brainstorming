import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, serializeWorkbook } from '../../src/core'
import { isDirty, useEditor } from '../../src/renderer/src/state/editor'
import { newDocument, openDocument, saveDocument } from '../../src/renderer/src/state/files'
import type { DesktopAPI, OpenedDocument, SaveRequest } from '../../src/shared/contracts'
import { suggestedFileName } from '../../src/renderer/src/state/fileName'
import { getNavigationTarget } from '../../src/renderer/src/state/keyboard'

function desktop(overrides: Partial<DesktopAPI> = {}): DesktopAPI {
  return {
    platform: 'macos',
    getWindowState: vi.fn(() => Promise.resolve({ focused: true, fullScreen: false })),
    onWindowStateChanged: vi.fn(() => () => undefined),
    selectAsset: () => Promise.resolve(null),
    exportAsset: () => Promise.resolve(false),
    hasOpenFile: () => Promise.resolve(false),
    takeOpenFile: () => Promise.resolve(null),
    onOpenFile: () => () => undefined,
    openDocument: vi.fn(() => Promise.resolve(null)),
    saveDocument: vi.fn(() => Promise.resolve('/map.trelyx')),
    readRecovery: vi.fn(() => Promise.resolve(null)),
    writeRecovery: vi.fn(() => Promise.resolve()),
    setDirty: vi.fn(),
    getRecentFiles: vi.fn(() => Promise.resolve([])),
    openRecent: vi.fn(() => Promise.resolve(null)),
    onMenuAction: vi.fn(() => () => undefined),
    ...overrides,
  }
}
beforeEach(() => {
  useEditor.getState().replace(createDocument('起点'))
  useEditor.setState({ busy: false, recovery: null })
  vi.stubGlobal('window', { trelyx: desktop(), confirm: vi.fn(() => true) })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('编辑器操作与草稿', () => {
  it('备注草稿只提交一次历史；超长备注保留输入并阻止切换覆盖', () => {
    const state = useEditor.getState()
    state.startEdit('root', undefined, 'notes')
    state.setDraft('第一行\n第二行')
    state.commitDraft()
    expect(useEditor.getState().history.document.title).toBe('起点')
    expect(useEditor.getState().history.document.topics.root?.notes).toBe('第一行\n第二行')
    expect(useEditor.getState().history.past).toHaveLength(1)
    state.undo()
    expect(useEditor.getState().history.document.topics.root?.notes).toBeUndefined()
    state.startEdit('root', undefined, 'notes')
    const oversized = '长'.repeat(100_001)
    state.setDraft(oversized)
    state.addSheet()
    expect(useEditor.getState().workbook.sheets).toHaveLength(1)
    expect(useEditor.getState().draft).toBe(oversized)
    expect(useEditor.getState().error).toContain('100000')
  })
  it('多次输入只在结束编辑时提交一次历史，撤销保留原文', () => {
    const state = useEditor.getState()
    state.startEdit('root')
    state.setDraft('新')
    state.setDraft('新的想法')
    expect(isDirty()).toBe(true)
    expect(useEditor.getState().history.past).toHaveLength(0)
    state.commitDraft()
    expect(useEditor.getState().history.document.title).toBe('新的想法')
    expect(useEditor.getState().history.past).toHaveLength(1)
    state.undo()
    expect(useEditor.getState().history.document.title).toBe('起点')
    expect(isDirty()).toBe(false)
  })
  it('向折叠主题添加子主题在同一次历史中展开，撤销恢复折叠', () => {
    const state = useEditor.getState()
    state.command({ type: 'toggleCollapse', topicId: 'root' })
    state.add('child')
    expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(false)
    expect(Object.keys(useEditor.getState().history.document.topics)).toHaveLength(2)
    state.cancelEdit()
    state.undo()
    expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(true)
    expect(Object.keys(useEditor.getState().history.document.topics)).toHaveLength(1)
  })
  it('删除分支后选择父主题，无效移动保留文档且显示原因', () => {
    const state = useEditor.getState()
    state.add('child')
    state.cancelEdit()
    const child = useEditor.getState().selectedId
    const before = useEditor.getState().history.document
    expect(state.command({ type: 'moveTopic', topicId: child, parentId: child })).toBe(false)
    expect(useEditor.getState().history.document).toBe(before)
    expect(useEditor.getState().error).toContain('后代')
    state.remove()
    expect(useEditor.getState().selectedId).toBe('root')
    expect(useEditor.getState().history.document.topics[child]).toBeUndefined()
  })
})

describe('文件边界', () => {
  it('保存时提交草稿，保存过程中新增输入仍然保持未保存', async () => {
    let finish: ((path: string) => void) | undefined
    const saved = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    window.trelyx = desktop({ saveDocument: saved })
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('已写入的标题')
    const operation = saveDocument()
    expect(saved.mock.calls).toHaveLength(1)
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('保存期间的新输入')
    finish?.('/map.trelyx')
    await operation
    expect(useEditor.getState().history.document.title).toBe('已写入的标题')
    expect(useEditor.getState().draft).toBe('保存期间的新输入')
    expect(isDirty()).toBe(true)
    expect(useEditor.getState().path).toBe('/map.trelyx')
  })
  it('保存取消或失败都保留脏状态，失败给出可见原因', async () => {
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('未保存')
    window.trelyx = desktop({ saveDocument: vi.fn(() => Promise.resolve(null)) })
    await saveDocument()
    expect(isDirty()).toBe(true)
    expect(useEditor.getState().path).toBeNull()
    window.trelyx = desktop({
      saveDocument: vi.fn(() => Promise.reject(new Error('磁盘空间不足'))),
    })
    await saveDocument()
    expect(isDirty()).toBe(true)
    expect(useEditor.getState().error).toBe('磁盘空间不足')
    expect(useEditor.getState().busy).toBe(false)
  })
  it('无效导入保留当前文档；取消放弃更改时不创建新导图', async () => {
    const before = useEditor.getState().history.document
    window.trelyx = desktop({
      openDocument: vi.fn(() => Promise.resolve({ path: '/broken.trelyx', contents: '{broken' })),
    })
    await openDocument()
    expect(useEditor.getState().history.document).toBe(before)
    expect(useEditor.getState().error).toContain('JSON')
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('保留这份草稿')
    window.confirm = vi.fn(() => false)
    newDocument()
    expect(useEditor.getState().history.document.title).toBe('保留这份草稿')
    expect(isDirty()).toBe(true)
  })
})

describe('读取期间的更改保护', () => {
  it('取消第二次确认时完整保留新增历史和未提交草稿', async () => {
    let finish: ((result: OpenedDocument) => void) | undefined
    window.trelyx = desktop({
      openDocument: vi.fn(
        () =>
          new Promise<OpenedDocument>((resolve) => {
            finish = resolve
          }),
      ),
    })
    const operation = openDocument()
    const state = useEditor.getState()
    state.add('child')
    state.cancelEdit()
    state.startEdit('root')
    state.setDraft('读取期间继续写下的想法')
    const before = useEditor.getState()
    const confirm = vi.fn(() => false)
    window.confirm = confirm
    finish?.({
      path: '/other.trelyx',
      contents: serializeWorkbook(createWorkbook(createDocument('其他文件'))),
    })
    await operation
    expect(confirm).toHaveBeenCalledOnce()
    expect(useEditor.getState().history).toBe(before.history)
    expect(useEditor.getState().draft).toBe('读取期间继续写下的想法')
    expect(useEditor.getState().editingId).toBe('root')
    expect(useEditor.getState().path).toBeNull()
    expect(useEditor.getState().busy).toBe(false)
  })
  it('明确放弃读取期间的更改后才切换文档；无并发更改时不重复确认', async () => {
    let finish: ((result: OpenedDocument) => void) | undefined
    window.trelyx = desktop({
      openDocument: vi.fn(
        () =>
          new Promise<OpenedDocument>((resolve) => {
            finish = resolve
          }),
      ),
    })
    const confirm = vi.fn(() => true)
    window.confirm = confirm
    const operation = openDocument()
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('等待期间的编辑')
    finish?.({
      path: '/other.trelyx',
      contents: serializeWorkbook(createWorkbook(createDocument('其他文件'))),
    })
    await operation
    expect(confirm).toHaveBeenCalledOnce()
    expect(useEditor.getState().history.document.title).toBe('其他文件')
    expect(useEditor.getState().draft).toBe('')
    expect(useEditor.getState().path).toBe('/other.trelyx')
    confirm.mockClear()
    window.trelyx = desktop({
      openDocument: vi.fn(() =>
        Promise.resolve({
          path: '/other.trelyx',
          contents: serializeWorkbook(createWorkbook(createDocument('其他文件'))),
        }),
      ),
    })
    await openDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('可见导航与保存文件名', () => {
  it('左右箭头在折叠中心主题上保持选择；展开后才能进入分支', () => {
    let document = createDocument('起点')
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: 'left',
      title: '左',
      side: 'left',
    })
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: 'right',
      title: '右',
      side: 'right',
    })
    const folded = applyCommand(document, { type: 'toggleCollapse', topicId: 'root' })
    expect(getNavigationTarget(folded, 'root', 'ArrowLeft')).toBeUndefined()
    expect(getNavigationTarget(folded, 'root', 'ArrowRight')).toBeUndefined()
    expect(getNavigationTarget(document, 'root', 'ArrowLeft')).toBe('left')
    expect(getNavigationTarget(document, 'root', 'ArrowRight')).toBe('right')
  })
  it('长 Unicode 标题独立转换为安全文件名，保存不改变文档标题', async () => {
    const title = '规划/调研:*?' + '🌱中文'.repeat(200)
    useEditor.getState().replace(createDocument(title))
    const persist = vi.fn((request: SaveRequest) => Promise.resolve(request.suggestedName))
    window.trelyx = desktop({ saveDocument: persist })
    await saveDocument()
    const request = persist.mock.calls[0]?.[0]
    expect(request?.suggestedName).toMatch(/^规划-调研---/u)
    expect(request?.suggestedName.endsWith('.trelyx')).toBe(true)
    expect(new TextEncoder().encode(request?.suggestedName).byteLength).toBeLessThanOrEqual(160)
    expect(request?.suggestedName).not.toContain('�')
    expect(useEditor.getState().history.document.title).toBe(title)
    expect(isDirty()).toBe(false)
    expect(suggestedFileName('CON')).toBe('_CON.trelyx')
    expect(suggestedFileName('...')).toBe('未命名导图.trelyx')
  })
})
