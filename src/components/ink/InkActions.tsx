import { Eraser, MousePointer2, PenLine, Settings2 } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { setInkMode, useCanvasInk } from '@renderer/state/canvasInk'
import { DockAction } from '@renderer/components/DockAction'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import type { InkMode } from '@renderer/state/canvasInk'

export const InkActions = () => {
  const { translate } = useMessages()
  const { mode, color, width } = useCanvasInk()
  const busy = useEditor((state) => state.busy)
  const chooseMode = (next: InkMode): void => {
    useEditor.getState().commitDraft()
    if (useEditor.getState().editingId) return
    useAnnotationInteraction.setState({
      fromId: null,
      relationMode: false,
      floating: false,
      editing: false,
      selected: null,
    })
    setInkMode(next)
  }
  return (
    <div
      role="group"
      aria-label={translate('inkTools')}
      className="flex shrink-0 items-center gap-0.5"
    >
      <DockAction
        caption={translate('inkPen')}
        aria-label={translate('inkPen')}
        aria-pressed={mode === 'pen'}
        disabled={busy}
        onClick={() => {
          chooseMode(mode === 'pen' ? 'select' : 'pen')
        }}
      >
        <PenLine />
      </DockAction>
      <DockAction
        caption={translate('inkEraser')}
        aria-label={translate('inkEraser')}
        aria-pressed={mode === 'eraser'}
        disabled={busy}
        onClick={() => {
          chooseMode(mode === 'eraser' ? 'select' : 'eraser')
        }}
      >
        <Eraser />
      </DockAction>
      {mode !== 'select' && (
        <DockAction
          caption={translate('inkSelect')}
          aria-label={translate('inkSelect')}
          disabled={busy}
          onClick={() => {
            chooseMode('select')
          }}
        >
          <MousePointer2 />
        </DockAction>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <DockAction
            caption={translate('inkSettings')}
            aria-label={translate('inkSettings')}
            disabled={busy}
          >
            <Settings2 />
          </DockAction>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-64 space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            {translate('inkColor')}
            <Input
              className="h-9 w-16 p-1"
              type="color"
              value={color}
              onChange={(event) => {
                useCanvasInk.setState({ color: event.target.value })
              }}
            />
          </label>
          <div className="space-y-2">
            <p id="ink-width-label" className="text-sm">
              {translate('inkWidth')}
            </p>
            <Select
              value={String(width)}
              onValueChange={(value) => {
                const next = Number(value)
                if ([1, 2, 4, 8, 12, 16, 24].includes(next)) useCanvasInk.setState({ width: next })
              }}
            >
              <SelectTrigger className="w-full" aria-labelledby="ink-width-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 8, 12, 16, 24].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
