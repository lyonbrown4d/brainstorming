import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import {
  deleteSelectedTopics,
  moveSelectedTopics,
  selectTopic,
  selectedTopicIds,
  setSelectedTopics,
  updateSelectedStyle,
} from '@renderer/state/selection'
import {
  currentSearchResults,
  replaceSearchResults,
  revealSearchMatch,
  useSearch,
} from '@renderer/state/search'

const fixture = () => {
  let document = createDocument('路线')
  for (const [id, parentId, title] of [
    ['a', 'root', 'Alpha alpha'],
    ['b', 'root', 'Beta'],
    ['c', 'a', 'Alpha child'],
  ]) {
    document = applyCommand(document, {
      type: 'addTopic',
      id: id ?? '',
      parentId: parentId ?? '',
      title: title ?? '',
      side: 'right',
    })
  }
  return applyCommand(document, { type: 'setTopicNotes', topicId: 'a', notes: 'Alpha notes' })
}
beforeEach(() => {
  useEditor.getState().replace(fixture())
  useEditor.setState({ busy: false })
  useSearch.setState({
    open: false,
    query: '',
    replacement: '',
    matchCase: false,
    wholeWord: false,
    includeNotes: true,
    allSheets: false,
  })
})

describe('主题多选', () => {
  it('再次选择当前主题保留草稿，切换主题时才提交', () => {
    selectTopic('a')
    useEditor.getState().startEdit('a', '未提交的标题')
    selectTopic('a')
    expect(useEditor.getState().editingId).toBe('a')
    expect(useEditor.getState().draft).toBe('未提交的标题')
    expect(useEditor.getState().history.past).toHaveLength(0)
    selectTopic('b')
    expect(useEditor.getState().history.document.topics.a?.title).toBe('未提交的标题')
    expect(useEditor.getState().history.past).toHaveLength(1)
    expect(useEditor.getState().selectedId).toBe('b')
  })
  it('修饰键切换选择，样式和删除各只有一次撤销', () => {
    selectTopic('a')
    selectTopic('b', true)
    expect(selectedTopicIds(useEditor.getState())).toEqual(['a', 'b'])
    updateSelectedStyle({ fill: '#ffffff', fontSize: 20 })
    expect(useEditor.getState().history.past).toHaveLength(1)
    for (const id of ['a', 'b'])
      expect(useEditor.getState().history.document.topics[id]?.style?.fontSize).toBe(20)
    selectTopic('root', true)
    deleteSelectedTopics()
    expect(Object.keys(useEditor.getState().history.document.topics)).toEqual(['root'])
    expect(useEditor.getState().selectedId).toBe('root')
    useEditor.getState().undo()
    expect(Object.keys(useEditor.getState().history.document.topics)).toHaveLength(4)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.a?.style).toBeUndefined()
  })
  it('批量移动保留顺序并拒绝移入后代，选择按画布独立保存', () => {
    setSelectedTopics(['a', 'c'])
    const before = useEditor.getState().history.document
    moveSelectedTopics('c')
    expect(useEditor.getState().history.document).toBe(before)
    expect(useEditor.getState().error).toBeTruthy()
    setSelectedTopics(['c', 'b'])
    moveSelectedTopics('root')
    expect(useEditor.getState().history.document.topics.root?.children).toEqual(['a', 'c', 'b'])
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toBe(before)
    const first = useEditor.getState().activeSheetId
    useEditor.getState().addSheet()
    selectTopic(useEditor.getState().selectedId)
    useEditor.getState().switchSheet(first)
    expect(selectedTopicIds(useEditor.getState())).toEqual(['c', 'b'])
  })
})

describe('查找与替换', () => {
  it('定位隐藏结果时展开祖先，字段替换不影响标题且可撤销', async () => {
    useEditor.getState().command({ type: 'toggleCollapse', topicId: 'a' })
    useSearch.setState({ query: 'Alpha', replacement: '新' })
    const results = currentSearchResults()
    expect(results).toHaveLength(3)
    const child = results.find((match) => match.topicId === 'c')
    expect(child).toBeDefined()
    if (child) revealSearchMatch(child)
    expect(useEditor.getState().selectedId).toBe('c')
    expect(useEditor.getState().history.document.topics.a?.collapsed).toBe(false)
    const note = currentSearchResults().find((match) => match.field === 'notes')
    if (note) await replaceSearchResults(note)
    expect(useEditor.getState().history.document.topics.a?.notes).toBe('新 notes')
    expect(useEditor.getState().history.document.topics.a?.title).toBe('Alpha alpha')
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.a?.notes).toBe('Alpha notes')
  })
  it('所有画布搜索跨页定位，全部替换仅修改当前画布且一次撤销', async () => {
    const first = useEditor.getState().activeSheetId
    useEditor.getState().addSheet()
    const second = useEditor.getState().activeSheetId
    useEditor.getState().command({
      type: 'renameTopic',
      topicId: useEditor.getState().history.document.rootId,
      title: 'Alpha sheet',
    })
    useSearch.setState({ query: 'Alpha', replacement: '新', allSheets: true })
    expect(currentSearchResults().some((match) => match.sheetId === first)).toBe(true)
    const secondMatch = currentSearchResults().find((match) => match.sheetId === second)
    if (secondMatch) revealSearchMatch(secondMatch)
    const past = useEditor.getState().history.past.length
    await replaceSearchResults()
    expect(useEditor.getState().history.past).toHaveLength(past + 1)
    expect(useEditor.getState().history.document.title).toBe('新 sheet')
    expect(
      useEditor.getState().workbook.sheets.find((sheet) => sheet.id === first)?.document.topics.a
        ?.title,
    ).toBe('Alpha alpha')
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.title).toBe('Alpha sheet')
  })
})
