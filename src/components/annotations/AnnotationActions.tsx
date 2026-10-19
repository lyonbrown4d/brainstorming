import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect } from 'react'
import { CornerDownRight, Group, Link2, MessageSquareText } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import {
  addSelectionCallout,
  addSelectionGroup,
  toggleRelationMode,
  useAnnotationInteraction,
} from '@renderer/state/annotationInteraction'
import { isCompositionKey } from '@renderer/state/keyboard'
import { DockAction } from '@renderer/components/DockAction'

export const AnnotationActions = () => {
  const { translate } = useMessages()

  const relationMode = useAnnotationInteraction((state) => state.relationMode)
  const sheetId = useEditor((state) => state.activeSheetId)
  useEffect(() => {
    if (
      useAnnotationInteraction.getState().sheetId &&
      useAnnotationInteraction.getState().sheetId !== sheetId
    )
      useAnnotationInteraction.setState({
        fromId: null,
        relationMode: false,
        sheetId: null,
        selected: null,
        editing: false,
        floating: false,
      })
  }, [sheetId])
  useEffect(() => {
    const cancel = (event: KeyboardEvent): void => {
      if (
        event.key !== 'Escape' ||
        isCompositionKey(event) ||
        (!useAnnotationInteraction.getState().relationMode &&
          !useAnnotationInteraction.getState().floating)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      useAnnotationInteraction.setState({
        relationMode: false,
        fromId: null,
        sheetId: null,
        floating: false,
      })
    }
    window.addEventListener('keydown', cancel, true)
    return () => {
      window.removeEventListener('keydown', cancel, true)
    }
  }, [])
  return (
    <>
      <DockAction
        caption={translate('relation')}
        aria-label={translate('relationship')}
        title={translate('relationshipSelectAStartTopicThenClick')}
        aria-pressed={relationMode}
        className="aria-pressed:bg-accent"
        onClick={toggleRelationMode}
      >
        <Link2 className="size-4" />
      </DockAction>
      <DockAction
        caption={translate('boundary')}
        aria-label={translate('addBoundary')}
        title={translate('addBoundaryAroundSelectedTopics')}
        onClick={() => {
          addSelectionGroup('boundary')
        }}
      >
        <Group className="size-4" />
      </DockAction>
      <DockAction
        caption={translate('summary')}
        aria-label={translate('addSummary')}
        title={translate('addSummaryForSelectedTopics')}
        onClick={() => {
          addSelectionGroup('summary')
        }}
      >
        <CornerDownRight className="size-4" />
      </DockAction>
      <DockAction
        caption={translate('callout')}
        aria-label={translate('addCallout')}
        title={translate('addCalloutToSelectedTopic')}
        onClick={addSelectionCallout}
      >
        <MessageSquareText className="size-4" />
      </DockAction>
    </>
  )
}

export const AnnotationModeHint = () => {
  const { translate } = useMessages()

  const fromId = useAnnotationInteraction((state) => state.fromId)
  const relationMode = useAnnotationInteraction((state) => state.relationMode)
  const floating = useAnnotationInteraction((state) => state.floating)
  if (!relationMode && !floating) return null
  return (
    <span
      className="block rounded-xl border bg-background/95 px-3 py-2 text-center text-xs shadow-sm"
      role="status"
    >
      {floating
        ? translate('clickEmptyCanvasToAddAFloating')
        : fromId
          ? translate('clickATargetTopicToConnectEsc')
          : translate('relationshipSelectAStartTopicThenClick')}
    </span>
  )
}
