import { StructurePreview } from '@renderer/components/documents/StructurePreview'
import type { CreationLayout } from '@renderer/components/creation/types'
import { cn } from '@renderer/lib/utils'

export const CreationStructurePreview = ({
  layout,
  className,
}: {
  layout: CreationLayout
  className?: string
}) =>
  layout === 'none' ? (
    <svg
      viewBox="0 0 120 72"
      aria-hidden="true"
      focusable="false"
      className={cn('size-auto h-14 w-full text-primary', className)}
    >
      <rect x="44" y="30" width="32" height="12" rx="4" fill="currentColor" />
    </svg>
  ) : (
    <StructurePreview kind={layout} {...(className ? { className } : {})} />
  )
