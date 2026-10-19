import { LoaderCircle } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/** Decorative alongside the operation's existing accessible name or status. */
export const LoadingIndicator = ({
  className,
  placement,
}: {
  readonly className?: string
  readonly placement?: 'start' | 'end'
}) => (
  <LoaderCircle
    aria-hidden="true"
    data-loading-indicator
    data-icon={placement ? `inline-${placement}` : undefined}
    className={cn(
      'size-4 shrink-0 animate-[spin_var(--loading-cycle)_linear_infinite] motion-reduce:animate-none',
      className,
    )}
  />
)
