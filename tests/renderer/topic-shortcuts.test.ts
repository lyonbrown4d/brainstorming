import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExampleDocument, getParentId } from '@core'
import { createStoryDesktop } from '@stories/desktopBridge'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { useEditor } from '@renderer/state/editor'
import { handleTopicNavigation, handleTopicShortcut } from '@renderer/state/editingShortcuts'
import { useTopicPropertyFocus } from '@renderer/state/topicShortcutActions'
import { selectedTopicIds } from '@renderer/state/selection'
import { useViewportRequest } from '@renderer/state/viewport'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import type { DesktopPlatform } from '@shared/window'

let restore: (() => void) | undefined
const platform = (value: DesktopPlatform) => {
  restore?.()
  restore = installPlatformAPI({ ...createStoryDesktop(), platform: value })
}
const key = (value: string, options: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    key: value,
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    preventDefault: vi.fn(),
    ...options,
  }) as KeyboardEvent
const modifier = (value: DesktopPlatform) =>
  value === 'macos' ? { metaKey: true } : { ctrlKey: true }

beforeEach(() => {
  platform('macos')
  useEditor.getState().replace(createExampleDocument())
  useEditor.setState({ busy: false })
  useTopicPropertyFocus.setState({ request: null })
  useAnnotationInteraction.setState({ selected: null, fromId: null, editing: false })
})
afterEach(() => {
  restore?.()
})

describe('Xmind-style topic shortcut states', () => {
  it('inserts a sibling before the selection with Shift+Enter and preserves its parent', () => {
    useEditor.getState().select('vision-1')
    const before = useEditor.getState().history.document
    expect(handleTopicNavigation(key('Enter', { shiftKey: true }))).toBe(true)
    const state = useEditor.getState()
    const id = state.selectedId
    expect(state.history.document.topics.vision?.children).toEqual(['vision-0', id, 'vision-1'])
    expect(getParentId(state.history.document, id)).toBe('vision')
    expect(state.editingId).toBe(id)
    state.cancelEdit()
    state.undo()
    expect(useEditor.getState().history.document).toBe(before)
  })

  it('leaves IME-owned structural keys untouched and Escape clears only a selection', () => {
    useEditor.getState().select('vision')
    const before = useEditor.getState().history
    expect(handleTopicNavigation(key('Tab', { isComposing: true }))).toBe(false)
    expect(handleTopicShortcut(key('r', { metaKey: true, isComposing: true }))).toBe(false)
    expect(useEditor.getState().history).toBe(before)
    handleTopicNavigation(key('Escape'))
    expect(selectedTopicIds(useEditor.getState())).toEqual([])
    expect(handleTopicNavigation(key('Tab'))).toBe(false)
    expect(useEditor.getState().history).toBe(before)
  })

  it.each(['macos', 'windows', 'linux'] as const)(
    '%s separates links, notes, relationships and viewport shortcuts',
    (value) => {
      platform(value)
      const mod = modifier(value)
      useEditor.getState().select('vision')
      expect(handleTopicShortcut(key('k', mod))).toBe(true)
      expect(useTopicPropertyFocus.getState().request).toMatchObject({
        topicId: 'vision',
        section: 'link',
      })
      expect(handleTopicShortcut(key('n', { ...mod, shiftKey: true }))).toBe(true)
      expect(useTopicPropertyFocus.getState().request?.section).toBe('notes')
      expect(handleTopicShortcut(key('r', { ...mod, shiftKey: true }))).toBe(true)
      expect(useAnnotationInteraction.getState().fromId).toBe('vision')
      expect(handleTopicShortcut(key('0', mod))).toBe(true)
      expect(useViewportRequest.getState().action).toBe('actualSize')
      expect(handleTopicShortcut(key('r', mod))).toBe(true)
      expect(useViewportRequest.getState().action).toBe('centerRoot')
      expect(useEditor.getState().selectedId).toBe('root')
    },
  )

  it.each(['macos', 'windows', 'linux'] as const)(
    '%s folds all selected descendants atomically with the platform combination',
    (value) => {
      platform(value)
      useEditor.getState().select('root')
      const event = key(value === 'macos' ? '?' : '/', {
        ...modifier(value),
        code: 'Slash',
        shiftKey: value === 'macos',
        altKey: value !== 'macos',
      })
      expect(handleTopicShortcut(event)).toBe(true)
      const state = useEditor.getState()
      const branches = Object.values(state.history.document.topics).filter(
        (topic) => topic.children.length,
      )
      expect(branches.every((topic) => topic.collapsed)).toBe(true)
      expect(state.history.past).toHaveLength(1)
      handleTopicShortcut(event)
      expect(
        Object.values(useEditor.getState().history.document.topics).every(
          (topic) => !topic.collapsed,
        ),
      ).toBe(true)
      state.undo()
      expect(useEditor.getState().history.document.topics.root?.collapsed).toBe(true)
    },
  )

  it('keeps macOS Control text commands and unsupported combinations out of map actions', () => {
    useEditor.getState().select('vision')
    const history = useEditor.getState().history
    expect(handleTopicShortcut(key('a', { ctrlKey: true }))).toBe(false)
    expect(handleTopicShortcut(key('c', { metaKey: true, altKey: true }))).toBe(false)
    expect(handleTopicShortcut(key('r', { metaKey: true, shiftKey: true, altKey: true }))).toBe(
      false,
    )
    expect(useEditor.getState().history).toBe(history)
    expect(selectedTopicIds(useEditor.getState())).toEqual(['vision'])
  })

  it('selects visible siblings or children without changing the document', () => {
    useEditor.getState().select('vision-0')
    const history = useEditor.getState().history
    handleTopicShortcut(key('a', { metaKey: true, shiftKey: true }))
    expect(selectedTopicIds(useEditor.getState())).toEqual(['vision-0', 'vision-1'])
    useEditor.getState().select('vision')
    handleTopicShortcut(key('a', { metaKey: true, altKey: true }))
    expect(selectedTopicIds(useEditor.getState())).toEqual(['vision-0', 'vision-1'])
    expect(useEditor.getState().history).toBe(history)
  })
})
