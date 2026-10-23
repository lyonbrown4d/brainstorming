import type { ReactNode } from 'react'
import {
  CirclePlus,
  ClipboardPaste,
  Copy,
  CopyPlus,
  CornerDownRight,
  FoldVertical,
  Link2,
  Pencil,
  Plus,
  Scissors,
  Trash2,
} from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useCanvasContextMenu } from '@renderer/hooks/useCanvasContextMenu'
import { useEditor } from '@renderer/state/editor'
import {
  deleteSelectedTopics,
  selectedTopicIds,
  selectedDrawingIds,
} from '@renderer/state/selection'
import {
  copySelectedTopics,
  duplicateSelectedTopics,
  pasteSelectedTopics,
} from '@renderer/state/clipboard'
import { insertParentTopic, removeTopicOnly } from '@renderer/state/structuralEditing'
import { toggleSelectedBranches } from '@renderer/state/topicShortcutActions'
import {
  createFloatingAt,
  selectAnnotation,
  toggleRelationMode,
  useAnnotationInteraction,
} from '@renderer/state/annotationInteraction'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { requestViewport } from '@renderer/state/viewport'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@renderer/components/ui/context-menu'

/** Business actions compose the official shadcn menu without modifying downloaded source. */
export const CanvasContextMenuSurface = ({
  children,
  interaction,
}: {
  children: ReactNode
  interaction: ReturnType<typeof useCanvasContextMenu>
}) => {
  const { translate } = useMessages()
  const { target, guard, prepare, run, disabled } = interaction
  const document = useEditor((state) => state.history.document)
  const id = useEditor((state) => state.selectedId)
  const removable =
    selectedTopicIds(useEditor.getState()).some((key) => key !== document.rootId) ||
    selectedDrawingIds(useEditor.getState()).length > 0
  const structural = id !== document.rootId && !document.floatingIds?.includes(id)
  const item = (
    label: string,
    Icon: typeof Plus,
    action: () => void,
    inactive = false,
    destructive = false,
  ) => (
    <ContextMenuItem
      key={label}
      disabled={inactive}
      variant={destructive ? 'destructive' : 'default'}
      onSelect={() => {
        run(action)
      }}
    >
      <Icon className="size-4" />
      {label}
    </ContextMenuItem>
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={disabled} onContextMenu={prepare}>
        <div className="contents" onContextMenuCapture={guard}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-60"
        aria-label={translate(target?.kind === 'pane' ? 'canvasActions' : 'topicEditingActions')}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (useAnnotationInteraction.getState().editing) return
          const state = useEditor.getState()
          const editingId = state.editingId ?? (target?.kind === 'topic' ? state.selectedId : null)
          const input = editingId
            ? window.document.querySelector<HTMLElement>(
                `.topic-input[data-topic-id="${CSS.escape(editingId)}"]`,
              )
            : null
          ;(input ?? window.document.getElementById('sheet-panel'))?.focus({ preventScroll: true })
        }}
      >
        {target?.kind === 'topic' && (
          <>
            {item(translate('editTopicTitle'), Pencil, () => {
              useEditor.getState().startEdit(id, undefined, 'canvas', 'end')
            })}
            {item(translate('addChildTopic'), CornerDownRight, () => {
              useEditor.getState().add('child')
            })}
            {item(translate('addSiblingTopic'), Plus, () => {
              useEditor.getState().add('sibling')
            })}
            {item(translate('insertParentAboveCurrentTopic'), Plus, insertParentTopic, !structural)}
            <ContextMenuSeparator />
            {item(translate('copyTopic'), Copy, () => {
              void copySelectedTopics()
            })}
            {item(
              translate('cutTopic'),
              Scissors,
              () => {
                void copySelectedTopics(true)
              },
              !removable,
            )}
            {item(translate('pasteTopic'), ClipboardPaste, () => {
              void pasteSelectedTopics()
            })}
            {item(translate('duplicateTopic'), CopyPlus, duplicateSelectedTopics)}
            <ContextMenuSeparator />
            {item(translate('relationship'), Link2, toggleRelationMode)}
            {item(
              translate('shortcutFold'),
              FoldVertical,
              toggleSelectedBranches,
              !document.topics[id]?.children.length,
            )}
            <ContextMenuSeparator />
            {item(
              translate('deleteCurrentTopicKeepingChildren'),
              Trash2,
              removeTopicOnly,
              !structural,
              true,
            )}
            {item(
              translate('deleteSelectedTopics'),
              Trash2,
              deleteSelectedTopics,
              !removable,
              true,
            )}
          </>
        )}
        {target?.kind === 'ink' &&
          item(translate('remove'), Trash2, deleteSelectedTopics, false, true)}
        {target && ['relation', 'group', 'callout'].includes(target.kind) && 'id' in target && (
          <>
            {item(
              translate(
                target.kind === 'relation'
                  ? 'editRelationshipLabel'
                  : target.kind === 'group'
                    ? 'editGroupLabel'
                    : 'editCalloutText',
              ),
              Pencil,
              () => {
                selectAnnotation(target.kind, target.id, true)
              },
            )}
            {item(
              translate('remove'),
              Trash2,
              () => {
                if (
                  runAnnotationCommand(
                    target.kind === 'relation'
                      ? { type: 'removeRelation', relationId: target.id }
                      : target.kind === 'group'
                        ? { type: 'removeGroup', groupId: target.id }
                        : { type: 'removeCallout', calloutId: target.id },
                  )
                )
                  useAnnotationInteraction.setState({ selected: null, editing: false })
              },
              false,
              true,
            )}
          </>
        )}
        {target?.kind === 'pane' && (
          <>
            {item(translate('addFloatingTopic'), CirclePlus, () => {
              useAnnotationInteraction.setState({ floating: true })
              createFloatingAt(target.x, target.y)
            })}
            {item(translate('actualSize'), Plus, () => {
              requestViewport('actualSize')
            })}
            {item(translate('goToCentralTopic'), CornerDownRight, () => {
              useEditor.getState().select(document.rootId)
              requestViewport('centerRoot')
            })}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const CanvasContextMenu = ({ children }: { children: ReactNode }) => {
  const interaction = useCanvasContextMenu()
  return <CanvasContextMenuSurface interaction={interaction}>{children}</CanvasContextMenuSurface>
}
