import { create } from 'zustand'
import {
  createExampleDocument,
  createHistory,
  executeCommand,
  getParentId,
  redo,
  serializeDocument,
  undo,
  type HistoryState,
  type MindMapDocument,
} from '@/core'

type Command = Parameters<typeof executeCommand>[1]
interface EditorState {
  history: HistoryState
  selectedId: string
  dropTargetId: string | null
  editingId: string | null
  draft: string
  baseline: string
  path: string | null
  error: string | null
  busy: boolean
  recovery: string | null
  outlineOpen: boolean
  select: (id: string) => void
  startEdit: (id: string, initial?: string) => void
  setDraft: (value: string) => void
  commitDraft: () => void
  cancelEdit: () => void
  command: (command: Command) => boolean
  add: (kind: 'child' | 'sibling') => void
  remove: () => void
  undo: () => void
  redo: () => void
  replace: (document: MindMapDocument, path?: string | null, recovered?: boolean) => void
  setError: (error: string | null) => void
}
const initial = createExampleDocument()
export const useEditor = create<EditorState>((set, get) => ({
  history: createHistory(initial),
  dropTargetId: null,
  selectedId: initial.rootId,
  editingId: null,
  draft: '',
  baseline: serializeDocument(initial),
  path: null,
  error: null,
  busy: false,
  recovery: null,
  outlineOpen: false,
  select: (id) => {
    get().commitDraft()
    set({ selectedId: id })
  },
  startEdit: (id, value) => {
    get().commitDraft()
    const topic = get().history.document.topics[id]
    if (topic) set({ selectedId: id, editingId: id, draft: value ?? topic.title })
  },
  setDraft: (draft) => {
    set({ draft })
  },
  commitDraft: () => {
    const { editingId, draft, history } = get()
    if (!editingId) return
    set({ editingId: null, draft: '' })
    if (history.document.topics[editingId]?.title !== draft.trim())
      get().command({
        type: 'renameTopic',
        topicId: editingId,
        title: draft.trim() || '未命名主题',
      })
  },
  cancelEdit: () => {
    set({ editingId: null, draft: '' })
  },
  command: (command) => {
    try {
      set({ history: executeCommand(get().history, command), error: null })
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '操作失败，请重试。' })
      return false
    }
  },
  add: (kind) => {
    get().commitDraft()
    const {
      history: { document },
      selectedId,
    } = get()
    const parentId =
      kind === 'child' ? selectedId : (getParentId(document, selectedId) ?? selectedId)
    const parent = document.topics[parentId]
    if (!parent) return
    const id = crypto.randomUUID()
    const current = document.topics[selectedId]
    const side =
      parentId === document.rootId && selectedId === document.rootId
        ? parent.children.length % 2 === 0
          ? 'right'
          : 'left'
        : (current?.side ?? 'right')
    const index =
      kind === 'sibling' && selectedId !== document.rootId
        ? parent.children.indexOf(selectedId) + 1
        : parent.children.length
    if (get().command({ type: 'addTopic', parentId, id, title: '新主题', side, index }))
      get().startEdit(id)
  },
  remove: () => {
    get().commitDraft()
    const {
      history: { document },
      selectedId,
    } = get()
    const parent = getParentId(document, selectedId)
    if (parent && get().command({ type: 'deleteTopic', topicId: selectedId }))
      set({ selectedId: parent })
  },
  undo: () => {
    get().commitDraft()
    const history = undo(get().history)
    set({
      history,
      selectedId: history.document.topics[get().selectedId]
        ? get().selectedId
        : history.document.rootId,
    })
  },
  redo: () => {
    get().commitDraft()
    const history = redo(get().history)
    set({
      history,
      selectedId: history.document.topics[get().selectedId]
        ? get().selectedId
        : history.document.rootId,
    })
  },
  replace: (document, path = null, recovered = false) => {
    set({
      history: createHistory(document),
      selectedId: document.rootId,
      editingId: null,
      draft: '',
      baseline: recovered ? '' : serializeDocument(document),
      path,
      error: null,
    })
  },
  setError: (error) => {
    set({ error })
  },
}))

const serializedCache = new WeakMap<MindMapDocument, string>()
export function serializedDocument(document: MindMapDocument): string {
  let contents = serializedCache.get(document)
  if (contents === undefined) {
    contents = serializeDocument(document)
    serializedCache.set(document, contents)
  }
  return contents
}
export function editorIsDirty(state: EditorState): boolean {
  return (
    serializedDocument(state.history.document) !== state.baseline ||
    (state.editingId !== null &&
      state.draft !== state.history.document.topics[state.editingId]?.title)
  )
}

export function isDirty(): boolean {
  return editorIsDirty(useEditor.getState())
}
