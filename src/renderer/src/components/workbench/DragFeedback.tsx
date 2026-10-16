import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MoveRight } from 'lucide-react'
import { canvasDragMessage, useCanvasInteraction } from '../../state/canvasInteraction'
import { useEditor } from '../../state/editor'

/** Shared screen-space feedback for both canvas projections. */
export function DragFeedback() {
  const drag = useCanvasInteraction((state) => state.drag)
  const sheetId = useEditor((state) => state.activeSheetId)
  const document = useEditor((state) => state.history.document)
  const reduced = useReducedMotion()
  const visible = drag?.sheetId === sheetId && drag.document === document ? drag : null
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-28 z-30 flex justify-center">
      <AnimatePresence key={`${document.id}:${sheetId}`} initial={false}>
        {visible && (
          <motion.div
            key={visible.sheetId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="drag-feedback"
            data-drop-target={visible.drop?.targetId}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 3 }}
            transition={{ duration: reduced ? 0 : 0.12, ease: 'easeOut' }}
            className={`flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-md ${visible.drop ? 'border-emerald-500/40 bg-emerald-700 text-white' : 'border-border bg-background/95 text-foreground'}`}
          >
            <MoveRight className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{canvasDragMessage(visible)}</span>
            {visible.roots.length > 1 && (
              <span className="shrink-0 border-l border-current/20 pl-2 opacity-80">
                {visible.roots.length} 个主题
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
