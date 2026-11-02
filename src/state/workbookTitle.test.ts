import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument, createWorkbook } from '@core'
import { useEditor } from '@renderer/state/editor'
import { suggestedFileName } from '@renderer/state/fileName'

beforeEach(() => {
  const document = applyCommand(createDocument('模板名称', 'doc'), {
    type: 'addTopic',
    parentId: 'root',
    id: 'leaf',
    title: '分支',
  })
  useEditor.getState().replace(createWorkbook(document))
})

describe('工作簿标题跟随中心主题', () => {
  it('把中心主题的新名字用作保存建议名，撤销后一起回滚', () => {
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: '项目规划' })
    expect(useEditor.getState().workbook.title).toBe('项目规划')
    expect(suggestedFileName(useEditor.getState().workbook.title)).toBe('项目规划.brainstorming')
    useEditor.getState().undo()
    expect(useEditor.getState().workbook.title).toBe('模板名称')
  })

  it('重命名普通分支不改变导图名称', () => {
    useEditor.getState().command({ type: 'renameTopic', topicId: 'leaf', title: '新分支' })
    expect(useEditor.getState().workbook.title).toBe('模板名称')
    expect(useEditor.getState().history.document.title).toBe('模板名称')
  })

  it('保留显式独立的工作簿名称，不被中心主题改名覆盖', () => {
    const document = createDocument('第一页', 'first')
    useEditor.getState().replace(createWorkbook(document, '独立标题'))
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: '新中心标题' })
    expect(useEditor.getState().workbook.title).toBe('独立标题')
  })
})
