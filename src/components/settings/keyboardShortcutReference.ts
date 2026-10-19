import type { MessageKey } from '@renderer/i18n'
import type { DesktopPlatform } from '@shared/window'

interface ShortcutGroup {
  readonly label: MessageKey
  readonly entries: readonly (readonly [string, MessageKey])[]
}

/** Current Xmind guide defaults for supported actions; platform differences stay explicit. */
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
        [`${mod} + /`, 'shortcutFold'],
        [mac ? 'Shift + ⌘ + /' : 'Ctrl + Alt + /', 'shortcutFoldAll'],
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
        [`${mod} + R`, 'goToCentralTopic'],
        [`${mod} + + / − / 0`, 'zoomInOutActualSize'],
        [`${mod} + F`, 'findAndReplace'],
        [`${mod} + I / ${alt} + Enter`, 'commandToggleProperties'],
        ['F5', 'presentationPlayFromStart'],
        ['拖动画布空白', 'panCanvasShiftdragToSelectTopics'],
      ],
    },
    {
      label: 'settingsShortcutFiles',
      entries: [
        [`${mod} + Z`, 'undo'],
        [mac ? 'Shift + ⌘ + Z' : 'Ctrl + Y / Shift + Ctrl + Z', 'redo'],
        [`${mod} + S / O / N`, 'saveOpenNew'],
        [`Shift + ${mod} + S`, 'saveAs'],
        ['Ctrl + Tab / Shift + Ctrl + Tab', 'mapTabShortcuts'],
        [`${mod} + W`, 'shortcutCloseMap'],
        [`${mod} + ,`, 'applicationSettings'],
        [`Shift + ${mod} + P`, 'commandPaletteTitle'],
      ],
    },
  ]
}
