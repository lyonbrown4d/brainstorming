import type { ReactNode } from 'react'
import { useWorkbenchInsets } from '../../hooks/useWorkbenchInsets'
import { cn } from '../../lib/utils'

/** Constrain canvas controls to the visible strip between the overlay panels. */
export function CanvasOverlay({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const insets = useWorkbenchInsets()
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 z-20 min-w-0 [container-type:inline-size]',
        className,
      )}
      style={insets}
    >
      {children}
    </div>
  )
}
