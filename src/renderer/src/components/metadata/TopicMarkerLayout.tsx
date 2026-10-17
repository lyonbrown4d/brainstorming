import type { ReactNode } from 'react'
import { motion, type MotionStyle } from 'motion/react'
import type { TopicMetadata } from '@core'
import { measureTopicMarkers } from '@layout'
import { MarkerIcon } from '@renderer/components/metadata/MarkerIcon'
import { Button } from '@renderer/components/ui/button'
import { useMarkerGesture } from '@renderer/hooks/useMarkerGesture'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'
import { setMetadataField } from '@renderer/components/metadata/commands'
export const TopicMarkerLayout = ({
  metadata,
  children,
  topicId,
}: {
  metadata: TopicMetadata | undefined
  children: ReactNode
  topicId: string
}) => {
  const markers = metadata?.markers ?? []
  const selected = useEditor(
    (state) => state.selectedId === topicId && !state.busy && !state.editingId,
  )
  const playing = usePresentation((state) => state.playing)
  const editable = selected && !playing
  const gesture = useMarkerGesture(
    topicId,
    metadata?.markerStyle ?? {},
    Math.min(4, markers.length),
  )
  const { size, position } = measureTopicMarkers(metadata)
  const positions = { top: '上方', bottom: '下方', left: '左侧', right: '右侧' }
  const markerStyle: MotionStyle & { '--marker-size': string } = {
    ...gesture.motionStyle,
    '--marker-size': `${size}px`,
  }
  const directions = {
    top: 'flex-col',
    bottom: 'flex-col-reverse',
    left: 'flex-row',
    right: 'flex-row-reverse',
  }
  const padding = position === 'left' || position === 'right' ? 'px-6 py-1.5' : 'p-1.5'
  return (
    <div
      className={`relative flex min-h-0 w-full flex-1 items-center justify-center ${markers.length ? `gap-3 ${padding} ${directions[position]}` : 'flex-col'}`}
    >
      {markers.length > 0 && (
        <motion.div
          className="nodrag nopan relative z-20 flex shrink-0 touch-none items-center justify-center text-[10px]"
          style={markerStyle}
          aria-label="主题图标"
          role="group"
          data-position={position}
          onPointerMove={gesture.move}
          onPointerUp={gesture.end}
          onPointerCancel={gesture.cancel}
          onLostPointerCapture={gesture.cancel}
        >
          <Button
            variant="ghost"
            className={`h-auto touch-none gap-1 rounded-sm p-0 text-inherit hover:bg-transparent has-[>svg]:px-0 ${editable ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
            aria-label="移动主题图标"
            title="拖动图标到主题的上、下、左、右侧"
            tabIndex={editable ? 0 : -1}
            onPointerDown={(event) => {
              if (editable) gesture.start(event, 'move')
            }}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              const next: Partial<Record<string, 'left' | 'right' | 'top' | 'bottom'>> = {
                ArrowLeft: 'left',
                ArrowRight: 'right',
                ArrowUp: 'top',
                ArrowDown: 'bottom',
              }
              const position = next[event.key]
              if (!editable || !position) return
              event.preventDefault()
              event.stopPropagation()
              setMetadataField(topicId, 'markerStyle', { ...metadata?.markerStyle, position })
            }}
          >
            {markers.slice(0, 4).map((marker) => (
              <MarkerIcon
                key={marker}
                marker={marker}
                className="size-[var(--marker-size)] shrink-0"
              />
            ))}
            {markers.length > 4 && <span title={markers.join('、')}>+{markers.length - 4}</span>}
          </Button>
          {editable && (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-x-3 -inset-y-2 rounded border border-primary/40"
            />
          )}
          {gesture.preview?.moved && (
            <span
              role="status"
              className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 whitespace-nowrap text-background shadow-sm"
            >
              {gesture.preview.mode === 'move'
                ? `松开放到${positions[gesture.preview.style.position ?? position]}`
                : `${gesture.preview.style.size ?? size} px`}
            </span>
          )}
          {editable &&
            (['left', 'right'] as const).map((side) => (
              <Button
                key={side}
                variant="ghost"
                size="icon"
                className={`absolute top-1/2 z-10 size-6 -translate-y-1/2 touch-none cursor-ew-resize rounded-full p-0 hover:bg-primary/10 ${side === 'left' ? '-left-6' : '-right-6'}`}
                aria-label={side === 'left' ? '从左侧缩放图标' : '从右侧缩放图标'}
                title="左右拖动调整图标大小"
                onPointerDown={(event) => {
                  gesture.start(event, side)
                }}
                onClick={(event) => {
                  event.stopPropagation()
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                  event.preventDefault()
                  event.stopPropagation()
                  setMetadataField(topicId, 'markerStyle', {
                    ...metadata?.markerStyle,
                    size: Math.max(12, Math.min(48, size + (event.key === 'ArrowRight' ? 1 : -1))),
                  })
                }}
              >
                <span className="pointer-events-none size-2 rounded-full border border-primary bg-background shadow-sm" />
              </Button>
            ))}
        </motion.div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center self-stretch">
        {children}
      </div>
    </div>
  )
}
