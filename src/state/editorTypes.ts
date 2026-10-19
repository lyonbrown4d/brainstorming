import type { Command, HistoryState, MindMapDocument, MindMapWorkbook } from '@core'

export type InspectorMode = 'topic' | 'canvas'
export type CanvasPropertySection = 'structure' | 'appearance' | 'template'

export type EditSelection = 'all' | 'end'

export type EditingSurface =
  'canvas' | 'inspector' | 'notes' | 'rich-title' | 'outline' | 'presentation-notes'

export interface SheetSession {
  history: HistoryState
  selectedId: string
  undoOrder: readonly number[]
  redoOrder: readonly number[]
}
export interface SheetView {
  x: number
  y: number
  zoom: number
}
export interface StructureSnapshot {
  workbook: MindMapWorkbook
  activeSheetId: string
  sessions: Readonly<Record<string, SheetSession>>
}
export interface StructureEdit {
  before: StructureSnapshot
  after: StructureSnapshot
  order: number
}
export interface EditorData extends StructureSnapshot {
  history: HistoryState
  selectedId: string
  dropTargetId: string | null
  editingId: string | null
  editingSurface: EditingSurface | null
  editingPageIndex: number | null
  draft: string
  editSelection: EditSelection
  richDraft: string | null
  baseline: string
  path: string | null
  error: string | null
  busy: boolean
  recovery: string | null
  importReport: { sourceName: string; warnings: readonly string[] } | null
  outlineOpen: boolean
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  canvasSection: CanvasPropertySection
  views: Readonly<Record<string, SheetView>>
  clock: number
  structurePast: readonly StructureEdit[]
  structureFuture: readonly StructureEdit[]
}
export interface EditorState extends EditorData {
  select: (id: string) => void
  startEdit: (
    id: string,
    initial?: string,
    surface?: EditingSurface,
    selection?: EditSelection,
  ) => void
  setDraft: (value: string) => void
  setRichDraft: (markdown: string, plainTitle: string) => void
  commitDraft: () => void
  cancelEdit: () => void
  command: (command: Command) => boolean
  add: (kind: 'child' | 'sibling') => void
  remove: () => void
  undo: () => void
  redo: () => void
  replace: (
    document: MindMapDocument | MindMapWorkbook,
    path?: string | null,
    recovered?: boolean,
  ) => void
  setError: (error: string | null) => void
  switchSheet: (id: string) => void
  addSheet: () => void
  addDocumentSheet: (document: MindMapDocument) => boolean
  renameSheet: (id: string, name: string) => void
  duplicateSheet: (id: string) => void
  deleteSheet: (id: string) => void
  moveSheet: (id: string, index: number) => void
}
