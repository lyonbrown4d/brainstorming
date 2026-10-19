import { closeInspector } from '@renderer/state/inspectorNavigation'
import type { ReactNode } from 'react'
import { AnimatedPanel } from '@renderer/components/AnimatedPanel'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@renderer/components/ui/dialog'
import { useCompactLayout } from '@renderer/hooks/useCompactLayout'
import { useEditor } from '@renderer/state/editor'
import { useMessages } from '@renderer/i18n/useMessages'

/** Desktop overlays become accessible, scrollable sheets on compact touch screens. */
export const WorkbenchPanel = ({
  children,
  side = 'left',
}: {
  readonly children: ReactNode
  readonly side?: 'left' | 'right'
}) => {
  const compact = useCompactLayout()
  const { translate } = useMessages()
  if (!compact) return <AnimatedPanel side={side}>{children}</AnimatedPanel>
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (side === 'left') useEditor.setState({ outlineOpen: false })
          else closeInspector()
        }
      }}
    >
      <DialogContent className="top-auto bottom-0 left-0 flex max-h-[calc(var(--app-height,100dvh)*0.85)] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] duration-200 data-[state=closed]:slide-out-to-bottom-3 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-bottom-3 data-[state=open]:zoom-in-100 motion-reduce:animate-none sm:max-w-none [&>aside]:max-h-[calc(var(--app-height,100dvh)*0.75)] [&>aside]:w-full [&>aside]:overflow-y-auto">
        <DialogTitle className="sr-only">
          {translate(side === 'left' ? 'documentOutline' : 'propertiesPanel')}
        </DialogTitle>
        <DialogDescription className="sr-only">{translate('returnToCanvas')}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  )
}
