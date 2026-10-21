import { useEffect, useRef, useState } from 'react'
import { Compass, Focus } from 'lucide-react'
import type { MindMapLayout } from '@layout'
import { isCompositionKey } from '@renderer/state/keyboard'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { saveSpatialView } from '@renderer/state/spatialActions'
import { getSpatialView, useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { Button } from '@renderer/components/ui/button'
import { SpatialAngleControl } from '@renderer/components/spatial/SpatialAngleControl'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'

interface PreviewSession {
  readonly workbookId: string
  readonly sheetId: string
  readonly document: object
  readonly original: SpatialView
  desired: Pick<SpatialView, 'yaw' | 'pitch'>
}

const PRESETS = [
  { key: 'spatialFront', yaw: 0, pitch: 0 },
  { key: 'spatialBack', yaw: Math.PI, pitch: 0 },
  { key: 'spatialLeft', yaw: -Math.PI / 2, pitch: 0 },
  { key: 'spatialRight', yaw: Math.PI / 2, pitch: 0 },
  { key: 'spatialTop', yaw: 0, pitch: Math.PI / 2 },
  { key: 'spatialBottom', yaw: 0, pitch: -Math.PI / 2 },
  { key: 'spatialIsometric', yaw: 0.7, pitch: 0.5 },
] as const

const radians = (degrees: number): number => (degrees * Math.PI) / 180
const degrees = (value: number): number => Math.round((value * 180) / Math.PI)

/** Presets and live angle adjustment share one undo boundary with orbit gestures. */
export const SpatialCameraControls = ({
  layout,
  depths,
}: {
  layout?: MindMapLayout | undefined
  depths?: Readonly<Record<string, number>> | null | undefined
}) => {
  const { translate } = useMessages()
  const { view, workbookId, sheetId } = useActiveSpatialView()
  const busy = useEditor((state) => state.busy)
  const editing = useEditor((state) => Boolean(state.editingId))
  const [open, setOpen] = useState(false)
  const preview = useRef<PreviewSession | null>(null)
  const disabled = busy || editing

  const cancel = (): void => {
    const session = preview.current
    if (!session) return
    preview.current = null
    useSpatialView.getState().clearView(session.workbookId, session.sheetId)
  }
  const start = (): PreviewSession => {
    if (preview.current) return preview.current
    const document = useEditor.getState().history.document
    const original = getSpatialView(workbookId, sheetId)
    const session = {
      workbookId,
      sheetId,
      document,
      original,
      desired: { yaw: original.yaw, pitch: original.pitch },
    }
    preview.current = session
    return session
  }
  const change = (patch: Pick<SpatialView, 'yaw'> | Pick<SpatialView, 'pitch'>): void => {
    if (disabled) return
    const session = start()
    session.desired = { ...session.desired, ...patch }
    useSpatialView.getState().setView(session.workbookId, session.sheetId, patch)
  }
  const commit = (): void => {
    const session = preview.current
    if (!session) return
    const latest = session.desired
    preview.current = null
    const editor = useEditor.getState()
    if (
      editor.workbook.id !== session.workbookId ||
      editor.activeSheetId !== session.sheetId ||
      editor.history.document !== session.document ||
      editor.busy ||
      editor.editingId
    ) {
      useSpatialView.getState().clearView(session.workbookId, session.sheetId)
      return
    }
    if (latest.yaw !== session.original.yaw || latest.pitch !== session.original.pitch)
      saveSpatialView({ yaw: latest.yaw, pitch: latest.pitch })
    else useSpatialView.getState().clearView(session.workbookId, session.sheetId)
  }
  useEffect(() => {
    const unsubscribe = useEditor.subscribe((editor) => {
      const session = preview.current
      if (
        session &&
        (editor.workbook.id !== session.workbookId ||
          editor.activeSheetId !== session.sheetId ||
          editor.history.document !== session.document ||
          editor.busy ||
          editor.editingId)
      )
        cancel()
    })
    return () => {
      unsubscribe()
      cancel()
    }
  }, [])
  const focus = (): void => {
    if (disabled || !layout?.nodes.length) return
    const selected = useEditor.getState().selectedId
    const selectedNode = layout.nodes.find((node) => node.id === selected)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const node of layout.nodes) {
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x + node.width)
      minY = Math.min(minY, node.y)
      maxY = Math.max(maxY, node.y + node.height)
    }
    const target = selectedNode
      ? {
          x: selectedNode.x + selectedNode.width / 2,
          y: selectedNode.y + selectedNode.height / 2,
          z: depths?.[selectedNode.id] ?? 0,
        }
      : { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: 0 }
    cancel()
    saveSpatialView({ target })
  }
  if (view.mode !== '3d') return null
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel()
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className="h-8 gap-1.5 text-xs">
          <Compass className="size-3.5" />
          {translate('spatialViewAngle')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-4 p-4"
        onPointerCancelCapture={cancel}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || isCompositionKey(event.nativeEvent)) return
          event.preventDefault()
          event.stopPropagation()
          cancel()
          setOpen(false)
        }}
      >
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map(({ key, yaw, pitch }) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-8 px-1 text-xs"
              onClick={() => {
                cancel()
                saveSpatialView({ yaw, pitch })
              }}
            >
              {translate(key)}
            </Button>
          ))}
        </div>
        <div className="space-y-4 border-t pt-3">
          <SpatialAngleControl
            label={translate('spatialHorizontalAngle')}
            min={-180}
            max={180}
            value={degrees(view.yaw)}
            onChange={(value) => {
              change({ yaw: radians(value) })
            }}
            onCommit={commit}
          />
          <SpatialAngleControl
            label={translate('spatialVerticalAngle')}
            min={-90}
            max={90}
            value={degrees(view.pitch)}
            onChange={(value) => {
              change({ pitch: radians(value) })
            }}
            onCommit={commit}
          />
        </div>
        <div className="flex gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 gap-1.5 text-xs"
            disabled={disabled || !layout?.nodes.length}
            onClick={focus}
          >
            <Focus className="size-3.5" />
            {translate('spatialFocusTarget')}
          </Button>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {translate('spatialCameraHint')}
        </p>
      </PopoverContent>
    </Popover>
  )
}
