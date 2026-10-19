import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import loadingMap from '@renderer/assets/brand/loading-map.svg'
import { cn } from '@renderer/lib/utils'

interface LoadingStateProps {
  readonly label: string
  readonly description?: string
  readonly variant?: 'inline' | 'surface'
  readonly className?: string
}

/** The operation owns its real phase, cancellation and recovery actions. */
export const LoadingState = ({
  label,
  description,
  variant = 'inline',
  className,
}: LoadingStateProps) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className={cn(
      'text-xs text-muted-foreground',
      variant === 'surface'
        ? 'flex min-w-0 flex-col items-center gap-4 px-4 py-6 text-center'
        : 'flex min-w-0 items-center gap-2',
      className,
    )}
  >
    {variant === 'surface' ? (
      <img
        src={loadingMap}
        alt=""
        aria-hidden="true"
        width="176"
        height="88"
        className="w-44 max-w-full animate-[loading-breathe_var(--loading-cycle)_ease-in-out_infinite] motion-reduce:animate-none"
      />
    ) : (
      <LoadingIndicator />
    )}
    <div className="min-w-0 max-w-full leading-5">
      <span>{label}</span>
      {description && <p className="mt-1 text-xs break-words">{description}</p>}
    </div>
  </div>
)
