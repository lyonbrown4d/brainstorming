import type { MessageKey } from '@renderer/i18n'
import type { DesktopPlatform } from '@shared/window'

interface ShortcutGroup {
  readonly label: MessageKey
  readonly entries: readonly (readonly [string, MessageKey])[]
}

/** Structural and text-editing bindings stay fixed to preserve native editor behavior. */
export const keyboardShortcutReference = (platform: DesktopPlatform): readonly ShortcutGroup[] => {
  const mac = platform === 'macos' || platform === 'ios'
  const mod = mac ? '⌘' : 'Ctrl'
  const alt = mac ? '⌥' : 'Alt'
  return [
    {
      label: 'settingsShortcutEditing',
      entries: [
        ['Tab', 'addChildTopic'],
        ['Tab / Shift + Tab', 'shortcutOutlineIndent'],
        ['Enter', 'addSiblingTopic'],
        ['Shift + Enter', 'shortcutShiftEnter'],
        ['Space / 双击', 'editSelectPlaceholderTextOrContinueExisting'],
        ['F2 / 直接输入', 'selectAllToEditReplaceTopicText'],
        ['Esc', 'shortcutEscape'],
        [`${mod} + Enter`, 'insertParentAboveCurrentTopic'],
        [mac ? '⌘ + Backspace' : 'Ctrl + Delete', 'deleteCurrentTopicKeepingChildren'],
        [`${alt} + ↑ / ↓`, 'reorderSiblingTopics'],
        ['Delete / Backspace', 'deleteSelectedBranchesOrAnnotations'],
        [`${mod} + K`, 'hyperlink'],
        [`Shift + ${mod} + N`, 'notes'],
        [`Shift + ${mod} + R`, 'relationship'],
        [mac ? 'Shift + ⌘ + B' : 'Ctrl + B', 'boundary'],
        [`Shift + ${mod} + I`, 'addImage'],
        [`${mod} + C / X / V`, 'shortcutClipboard'],
        [`${mod} + A`, 'shortcutSelectAll'],
        [`Shift + ${mod} + A`, 'shortcutSelectSiblings'],
        [`${alt} + ${mod} + A`, 'shortcutSelectChildren'],
      ],
    },
    {
      label: 'settingsShortcutNavigation',
      entries: [
        ['↑ ↓ ← →', 'navigateBetweenTopics'],
        [`${alt} + Enter`, 'commandToggleProperties'],
        ['拖动画布空白', 'panCanvasShiftdragToSelectTopics'],
      ],
    },
    {
      label: 'settingsShortcutFiles',
      entries: [
        ['Ctrl + Tab / Shift + Ctrl + Tab', 'mapTabShortcuts'],
        [`Shift + ${mod} + P`, 'commandPaletteTitle'],
      ],
    },
  ]
}
