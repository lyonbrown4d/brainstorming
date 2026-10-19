import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { usePresentation } from '@renderer/state/presentation'
import { usePasswordPrompt } from '@renderer/state/password'
import {
  closeCommandPalette,
  commandPaletteAvailable,
  openCommandPalette,
  useCommandPaletteState,
} from '@renderer/state/commandPalette'
import { paletteCommands, runPaletteCommand } from '@renderer/components/commands/paletteCommands'
import { useViewportRequest } from '@renderer/state/viewport'
import { useShortcutPreferences } from '@renderer/state/shortcutPreferences'
import { desktop } from '@tests/fixtures/desktop'

beforeEach(() => {
  desktop()
  useEditor.getState().replace(createDocument('现有导图'))
  useEditor.setState({ busy: false })
  usePresentation.setState({ playing: false, workspaceMode: null })
  usePasswordPrompt.setState({ request: null })
  useCommandPaletteState.setState({ open: false, returnFocus: null })
  useShortcutPreferences.getState().resetAll()
})
afterEach(() => vi.unstubAllGlobals())
const command = (id: string) => {
  const found = paletteCommands('⌘', vi.fn()).find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing command: ${id}`)
  return found
}

describe('global command palette guards and existing actions', () => {
  it('commits a valid active draft before opening and retains failed drafts', () => {
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('已提交的草稿')
    expect(openCommandPalette('/home')).toBe(true)
    expect(useEditor.getState().history.document.title).toBe('已提交的草稿')
    expect(useEditor.getState().editingId).toBeNull()
    closeCommandPalette()
    useEditor.getState().startEdit('root', 'x'.repeat(100_001), 'notes')
    expect(openCommandPalette('/home')).toBe(false)
    expect(useEditor.getState().editingId).toBe('root')
    expect(useEditor.getState().draft).toHaveLength(100_001)
    expect(useCommandPaletteState.getState().open).toBe(false)
  })

  it('blocks settings, password and playing without committing drafts', () => {
    useEditor.getState().startEdit('root', '保留草稿')
    expect(openCommandPalette('/settings')).toBe(false)
    usePasswordPrompt.setState({ request: { id: 1, title: '密码' } })
    expect(commandPaletteAvailable()).toBe(false)
    expect(openCommandPalette()).toBe(false)
    usePasswordPrompt.setState({ request: null })
    usePresentation.setState({ playing: true })
    expect(openCommandPalette()).toBe(false)
    expect(useEditor.getState().draft).toBe('保留草稿')
    expect(useEditor.getState().history.document.title).toBe('现有导图')
  })

  it('shows effective file and view shortcuts and hides cleared hints', () => {
    expect(command('save').shortcut).toBe('⌘S')
    expect(command('search').shortcut).toBe('⌘F')
    expect(useShortcutPreferences.getState().setChord('save', 'Mod+Shift+KeyG')).toBeNull()
    expect(command('save').shortcut).toBe('⌘⇧G')
    expect(useShortcutPreferences.getState().setChord('search', null)).toBeNull()
    expect(command('search').shortcut).toBeNull()
    useShortcutPreferences.getState().resetAll()
    expect(command('save').shortcut).toBe('⌘S')
  })

  it('keeps document and canvas commands disabled at home and rechecks busy state', () => {
    useWorkspace.setState({ screen: 'home', hasDocument: false })
    expect(command('new').enabled()).toBe(true)
    for (const id of ['save', 'save-as', 'undo', 'redo', 'sheet', 'search', 'zoom-in'])
      expect(command(id).enabled()).toBe(false)
    useWorkspace.setState({ screen: 'editor', hasDocument: true })
    const zoom = command('zoom-in')
    const before = useViewportRequest.getState().sequence
    useEditor.setState({ busy: true })
    expect(runPaletteCommand(zoom)).toBe(false)
    expect(useViewportRequest.getState().sequence).toBe(before)
    useEditor.setState({ busy: false })
    expect(runPaletteCommand(zoom)).toBe(true)
    expect(useViewportRequest.getState()).toMatchObject({ action: 'zoomIn', sequence: before + 1 })
    usePresentation.setState({ workspaceMode: 'composer' })
    expect(command('zoom-in').enabled()).toBe(false)
  })

  it('uses document history and the existing creation flow', () => {
    expect(command('undo').enabled()).toBe(false)
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: '新标题' })
    expect(runPaletteCommand(command('undo'))).toBe(true)
    expect(useEditor.getState().history.document.title).toBe('现有导图')
    expect(command('redo').enabled()).toBe(true)
    expect(runPaletteCommand(command('redo'))).toBe(true)
    expect(useEditor.getState().history.document.title).toBe('新标题')
    expect(runPaletteCommand(command('sheet'))).toBe(true)
    expect(useWorkspace.getState().screen).toBe('create-sheet')
  })
})
