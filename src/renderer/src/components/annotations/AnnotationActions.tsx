import { useEffect } from 'react'
import { CornerDownRight, Group, Link2, MessageSquareText } from 'lucide-react'
import { useEditor } from '../../state/editor'
import {
  addSelectionCallout,
  addSelectionGroup,
  toggleRelationMode,
  useAnnotationInteraction,
} from '../../state/annotationInteraction'
import { isCompositionKey } from '../../state/keyboard'
import { Button } from '../ui/button'

export function AnnotationActions() {
  const fromId = useAnnotationInteraction((state) => state.fromId)
  const sheetId = useEditor((state) => state.activeSheetId)
  useEffect(() => {
    if (
      useAnnotationInteraction.getState().sheetId &&
      useAnnotationInteraction.getState().sheetId !== sheetId
    )
      useAnnotationInteraction.setState({
        fromId: null,
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
        (!useAnnotationInteraction.getState().fromId &&
          !useAnnotationInteraction.getState().floating)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      useAnnotationInteraction.setState({ fromId: null, sheetId: null, floating: false })
    }
    window.addEventListener('keydown', cancel, true)
    return () => {
      window.removeEventListener('keydown', cancel, true)
    }
  }, [])
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="关联线"
        title="关联线：选中起点后点击目标主题"
        aria-pressed={Boolean(fromId)}
        className="aria-pressed:bg-accent"
        onClick={toggleRelationMode}
      >
        <Link2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="添加边界"
        title="为所选主题添加边界"
        onClick={() => {
          addSelectionGroup('boundary')
        }}
      >
        <Group className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="添加概要"
        title="为所选主题添加概要"
        onClick={() => {
          addSelectionGroup('summary')
        }}
      >
        <CornerDownRight className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="添加标注"
        title="为所选主题添加标注"
        onClick={addSelectionCallout}
      >
        <MessageSquareText className="size-4" />
      </Button>
    </>
  )
}

export function AnnotationModeHint() {
  const fromId = useAnnotationInteraction((state) => state.fromId)
  const floating = useAnnotationInteraction((state) => state.floating)
  if (!fromId && !floating) return null
  return (
    <span
      className="block rounded-xl border bg-background/95 px-3 py-2 text-center text-xs shadow-sm"
      role="status"
    >
      {floating ? '点击画布空白添加游离主题 · Esc 取消' : '点击目标主题建立关联线 · Esc 取消'}
    </span>
  )
}
