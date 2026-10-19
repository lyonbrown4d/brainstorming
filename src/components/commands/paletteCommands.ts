import {
  FilePlus2,
  FolderOpen,
  Save,
  Download,
  Undo2,
  Redo2,
  Search,
  ListTree,
  SlidersHorizontal,
  Plus,
  Minus,
  Scan,
  Focus,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { MessageKey } from '@renderer/i18n'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { usePresentation } from '@renderer/state/presentation'
import { newDocument, openDocument, saveDocument } from '@renderer/state/files'
import { beginCreation } from '@renderer/state/creation'
import { closeInspector, toggleInspector } from '@renderer/state/inspectorNavigation'
import { useSearch } from '@renderer/state/search'
import { requestViewport } from '@renderer/state/viewport'
import { commandPaletteAvailable } from '@renderer/state/commandPalette'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { formatShortcutChord } from '@renderer/state/shortcutMatching'
import {
  getShortcutChord,
  useShortcutPreferences,
  type ShortcutOverrides,
} from '@renderer/state/shortcutPreferences'
import type { ShortcutId } from '@renderer/state/shortcutRegistry'

export interface PaletteCommand {
  id: string
  label: MessageKey
  group: MessageKey
  icon: LucideIcon
  keywords: string[]
  shortcut?: string | null
  enabled: () => boolean
  run: () => void
}
const ready = (): boolean => commandPaletteAvailable()
const documentReady = (): boolean =>
  ready() && useWorkspace.getState().hasDocument && useWorkspace.getState().screen === 'editor'
const canvasReady = (): boolean => documentReady() && !usePresentation.getState().workspaceMode
const toggleOutline = (): void => {
  const editor = useEditor.getState()
  if (!editor.outlineOpen && window.matchMedia('(max-width: 767px)').matches) {
    closeInspector()
    if (useEditor.getState().inspectorOpen) return
  }
  useEditor.setState({ outlineOpen: !editor.outlineOpen })
}

export const paletteCommands = (
  _modifier: string,
  settings: () => void,
  overrides: ShortcutOverrides = useShortcutPreferences.getState().overrides,
): PaletteCommand[] => {
  const platform = requireDesktopAPI().platform
  const hint = (id: ShortcutId): string | null => {
    const chord = getShortcutChord(id, platform, overrides)
    return chord ? formatShortcutChord(chord, platform) : null
  }
  return [
    {
      id: 'new',
      label: 'newMap',
      group: 'commandGroupFiles',
      icon: FilePlus2,
      keywords: ['new document', '新建文档'],
      shortcut: hint('new'),
      enabled: ready,
      run: newDocument,
    },
    {
      id: 'sheet',
      label: 'newSheetLabel402',
      group: 'commandGroupFiles',
      icon: Plus,
      keywords: ['new sheet', '新建画布'],
      enabled: documentReady,
      run: () => {
        beginCreation('sheet')
      },
    },
    {
      id: 'open',
      label: 'openMap',
      group: 'commandGroupFiles',
      icon: FolderOpen,
      keywords: ['open file', '打开文件'],
      shortcut: hint('open'),
      enabled: ready,
      run: () => {
        void openDocument()
      },
    },
    {
      id: 'save',
      label: 'saveMap',
      group: 'commandGroupFiles',
      icon: Save,
      keywords: ['save', '保存'],
      shortcut: hint('save'),
      enabled: documentReady,
      run: () => {
        void saveDocument()
      },
    },
    {
      id: 'save-as',
      label: 'saveAs',
      group: 'commandGroupFiles',
      icon: Download,
      keywords: ['save as', '另存为'],
      shortcut: hint('saveAs'),
      enabled: documentReady,
      run: () => {
        void saveDocument(true)
      },
    },
    {
      id: 'undo',
      label: 'undo',
      group: 'commandGroupEdit',
      icon: Undo2,
      keywords: ['undo', '撤销'],
      shortcut: hint('undo'),
      enabled: () =>
        documentReady() &&
        (useEditor.getState().history.past.length > 0 ||
          useEditor.getState().structurePast.length > 0),
      run: () => {
        useEditor.getState().undo()
      },
    },
    {
      id: 'redo',
      label: 'redo',
      group: 'commandGroupEdit',
      icon: Redo2,
      keywords: ['redo', '重做'],
      shortcut: hint('redo'),
      enabled: () =>
        documentReady() &&
        (useEditor.getState().history.future.length > 0 ||
          useEditor.getState().structureFuture.length > 0),
      run: () => {
        useEditor.getState().redo()
      },
    },
    {
      id: 'search',
      label: 'commandSearchCanvas',
      group: 'commandGroupView',
      icon: Search,
      keywords: ['find search', '搜索查找'],
      shortcut: hint('search'),
      enabled: canvasReady,
      run: () => {
        useSearch.setState({ open: true })
      },
    },
    {
      id: 'outline',
      label: 'commandToggleOutline',
      group: 'commandGroupView',
      icon: ListTree,
      keywords: ['outline', '大纲'],
      enabled: canvasReady,
      run: toggleOutline,
    },
    {
      id: 'properties',
      shortcut: hint('inspector'),
      label: 'commandToggleProperties',
      group: 'commandGroupView',
      icon: SlidersHorizontal,
      keywords: ['inspector properties', '属性'],
      enabled: canvasReady,
      run: toggleInspector,
    },
    {
      id: 'zoom-in',
      shortcut: hint('zoomIn'),
      label: 'zoomIn',
      group: 'commandGroupView',
      icon: Plus,
      keywords: ['zoom in', '放大'],
      enabled: canvasReady,
      run: () => {
        requestViewport('zoomIn')
      },
    },
    {
      id: 'zoom-out',
      shortcut: hint('zoomOut'),
      label: 'zoomOut',
      group: 'commandGroupView',
      icon: Minus,
      keywords: ['zoom out', '缩小'],
      enabled: canvasReady,
      run: () => {
        requestViewport('zoomOut')
      },
    },
    {
      id: 'actual-size',
      shortcut: hint('actualSize'),
      label: 'commandActualSize',
      group: 'commandGroupView',
      icon: Scan,
      keywords: ['zoom 100%', '实际大小'],
      enabled: canvasReady,
      run: () => {
        requestViewport('actualSize')
      },
    },
    {
      id: 'center',
      label: 'commandCenterRoot',
      group: 'commandGroupView',
      icon: Focus,
      keywords: ['center root', '居中中心主题'],
      enabled: canvasReady,
      run: () => {
        requestViewport('centerRoot')
      },
    },
    {
      id: 'settings',
      shortcut: hint('settings'),
      label: 'applicationSettings',
      group: 'commandGroupApplication',
      icon: Settings,
      keywords: ['settings preferences', '设置偏好'],
      enabled: ready,
      run: settings,
    },
  ]
}

/** Availability is checked again after the dialog has closed. */
export const runPaletteCommand = (command: PaletteCommand): boolean => {
  if (!command.enabled()) return false
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId || !command.enabled()) return false
  command.run()
  return true
}
