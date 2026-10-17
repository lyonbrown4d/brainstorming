import { useDocumentTabs } from '@renderer/state/documentTabs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { desktop } from '@tests/fixtures/desktop'
import {
  applyWorkbookCommand,
  createDocument,
  createWorkbook,
  deserializeWorkbook,
  serializeWorkbook,
} from '@core'
import { isDirty, useEditor } from '@renderer/state/editor'
import { openDocument, saveDocument } from '@renderer/state/files'
import type { SaveRequest } from '@shared/contracts'

const renameRoot = (title: string): void => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title })
}

const titleOf = (id: string): string | undefined => {
  return useEditor.getState().workbook.sheets.find((sheet) => sheet.id === id)?.document.title
}

beforeEach(() => {
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  const workbook = applyWorkbookCommand(
    createWorkbook(createDocument('第一页', 'first'), '工作簿'),
    {
      type: 'addSheet',
      sheet: { id: 'second', name: '第二页', document: createDocument('第二页', 'second') },
    },
  )
  useEditor.getState().replace(workbook)
  useEditor.setState({ busy: false, recovery: null })
  vi.stubGlobal('window', { trelyx: desktop(), confirm: vi.fn(() => true) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('多画布内容与结构历史', () => {
  it('分别撤销重做各页内容，非当前画布的修改也参与脏状态判断', () => {
    renameRoot('第一页修改')
    useEditor.getState().switchSheet('second')
    expect(isDirty()).toBe(true)
    renameRoot('第二页修改')
    useEditor.getState().undo()
    expect(titleOf('second')).toBe('第二页')
    expect(titleOf('first')).toBe('第一页修改')
    useEditor.getState().switchSheet('first')
    useEditor.getState().undo()
    expect(titleOf('first')).toBe('第一页')
    expect(isDirty()).toBe(false)
    useEditor.getState().redo()
    useEditor.getState().switchSheet('second')
    useEditor.getState().redo()
    expect(titleOf('first')).toBe('第一页修改')
    expect(titleOf('second')).toBe('第二页修改')
    expect(useEditor.getState().sessions.first?.history.past).toHaveLength(1)
    expect(useEditor.getState().sessions.second?.history.past).toHaveLength(1)
  })

  it('纯切换保持已保存状态，切换时将草稿一次提交到原画布', () => {
    const workbook = useEditor.getState().workbook
    useEditor.getState().switchSheet('second')
    useEditor.getState().switchSheet('first')
    expect(useEditor.getState().workbook).toBe(workbook)
    expect(isDirty()).toBe(false)
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('原画布草稿')
    useEditor.getState().switchSheet('second')
    expect(titleOf('first')).toBe('原画布草稿')
    expect(titleOf('second')).toBe('第二页')
    expect(useEditor.getState().editingId).toBeNull()
    expect(useEditor.getState().draft).toBe('')
    expect(useEditor.getState().sessions.first?.history.past).toHaveLength(1)
    expect(isDirty()).toBe(true)
    useEditor.getState().switchSheet('first')
    useEditor.getState().undo()
    expect(isDirty()).toBe(false)
  })

  it('从另一画布撤销重做全局名称和顺序时保留存续画布后续的内容修改', () => {
    useEditor.getState().renameSheet('second', '重命名画布')
    useEditor.getState().moveSheet('second', 0)
    useEditor.getState().switchSheet('second')
    renameRoot('结构操作后继续编辑')
    useEditor.getState().switchSheet('first')
    useEditor.getState().undo()
    expect(useEditor.getState().workbook.sheets.map((sheet) => sheet.id)).toEqual([
      'first',
      'second',
    ])
    expect(titleOf('second')).toBe('结构操作后继续编辑')
    useEditor.getState().undo()
    expect(useEditor.getState().workbook.sheets[1]?.name).toBe('第二页')
    expect(titleOf('second')).toBe('结构操作后继续编辑')
    useEditor.getState().redo()
    useEditor.getState().redo()
    expect(useEditor.getState().workbook.sheets[0]?.name).toBe('重命名画布')
    expect(titleOf('second')).toBe('结构操作后继续编辑')
  })

  it('删除画布后撤销恢复内容、选中主题与独立历史，重做仍保留其他画布', () => {
    useEditor.getState().switchSheet('second')
    useEditor
      .getState()
      .command({ type: 'addTopic', parentId: 'root', id: 'child', title: '子主题' })
    useEditor.getState().select('child')
    const history = useEditor.getState().history
    useEditor.getState().deleteSheet('second')
    expect(useEditor.getState().activeSheetId).toBe('first')
    expect(useEditor.getState().sessions.second).toBeUndefined()
    useEditor.getState().undo()
    expect(useEditor.getState().activeSheetId).toBe('second')
    expect(useEditor.getState().selectedId).toBe('child')
    expect(useEditor.getState().history).toBe(history)
    expect(useEditor.getState().history.document.topics.child?.title).toBe('子主题')
    useEditor.getState().redo()
    expect(useEditor.getState().workbook.sheets.map((sheet) => sheet.id)).toEqual(['first'])
    expect(titleOf('first')).toBe('第一页')
  })

  it('复制为独立画布，并阻止删除最后一页', () => {
    renameRoot('复制源内容')
    useEditor.getState().duplicateSheet('first')
    const copyId = useEditor.getState().activeSheetId
    expect(copyId).not.toBe('first')
    expect(titleOf(copyId)).toBe('复制源内容')
    expect(useEditor.getState().history.past).toEqual([])
    renameRoot('副本内容')
    expect(titleOf('first')).toBe('复制源内容')
    useEditor.getState().deleteSheet('first')
    useEditor.getState().deleteSheet('second')
    const before = useEditor.getState().workbook
    useEditor.getState().deleteSheet(copyId)
    expect(useEditor.getState().workbook).toBe(before)
    expect(useEditor.getState().error).toContain('最后')
    expect(titleOf(copyId)).toBe('副本内容')
  })

  it('撤销新增画布再重做时保留新增之后的内容及独立历史', () => {
    useEditor.getState().addSheet()
    const addedId = useEditor.getState().activeSheetId
    renameRoot('新增画布后继续编辑')
    const addedHistory = useEditor.getState().history
    useEditor.getState().switchSheet('first')
    useEditor.getState().undo()
    expect(titleOf(addedId)).toBeUndefined()
    useEditor.getState().redo()
    expect(titleOf(addedId)).toBe('新增画布后继续编辑')
    expect(useEditor.getState().sessions[addedId]?.history).toBe(addedHistory)
    useEditor.getState().switchSheet(addedId)
    useEditor.getState().undo()
    expect(titleOf(addedId)).toBe('中心主题')
  })
})

describe('工作簿文件边界', () => {
  it('保存完整工作簿，保存期间新建画布和输入仍保持未保存', async () => {
    let finish: ((path: string) => void) | undefined
    const persist = vi.fn<(request: SaveRequest) => Promise<string>>(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    window.trelyx = desktop({ saveDocument: persist })
    renameRoot('第一页已保存内容')
    useEditor.getState().switchSheet('second')
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('第二页已保存内容')
    const saving = saveDocument()
    const request = persist.mock.calls[0]?.[0]
    if (!request) throw new Error('未调用保存')
    const saved = deserializeWorkbook(request.contents)
    expect(saved.title).toBe('工作簿')
    expect(saved.sheets.map((sheet) => sheet.document.title)).toEqual([
      '第一页已保存内容',
      '第二页已保存内容',
    ])
    useEditor.getState().addSheet()
    const newId = useEditor.getState().activeSheetId
    renameRoot('保存期间的新画布')
    finish?.('/workbook.trelyx')
    await saving
    expect(useEditor.getState().baseline).toBe(request.contents)
    expect(useEditor.getState().workbook.sheets).toHaveLength(3)
    expect(titleOf(newId)).toBe('保存期间的新画布')
    expect(isDirty()).toBe(true)
    expect(useEditor.getState().path).toBe('/workbook.trelyx')
    window.trelyx = desktop()
    await saveDocument()
    expect(isDirty()).toBe(false)
  })

  it('XMind 导入保持未保存，报告转换并使用新的原生文件路径保存', async () => {
    const legacy = createDocument('旧版中心', 'legacy')
    const persist = vi.fn<(request: SaveRequest) => Promise<string>>(() =>
      Promise.resolve('/legacy.trelyx'),
    )
    window.trelyx = desktop({
      openDocument: vi.fn(() =>
        Promise.resolve({
          path: null,
          sourcePath: '/source.xmind',
          contents: serializeWorkbook(createWorkbook(legacy)),
          warnings: ['1 个图片未导入'],
        }),
      ),
      saveDocument: persist,
    })
    await openDocument()
    expect(useEditor.getState().workbook.version).toBe(2)
    expect(useEditor.getState().workbook.sheets).toEqual([
      { id: 'legacy', name: '旧版中心', document: legacy },
    ])
    expect(useEditor.getState().activeSheetId).toBe('legacy')
    expect(isDirty()).toBe(true)
    expect(useEditor.getState().path).toBeNull()
    expect(useEditor.getState().importReport).toEqual({
      sourceName: 'source.xmind',
      warnings: ['1 个图片未导入'],
    })
    await saveDocument()
    const request = persist.mock.calls[0]?.[0]
    expect(request?.path).toBeNull()
    expect(request && deserializeWorkbook(request.contents).version).toBe(2)
    expect(isDirty()).toBe(false)
  })
})
