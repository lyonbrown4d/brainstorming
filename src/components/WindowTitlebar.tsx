import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

/** Shared chrome geometry for the editor and creation screens. Native macOS
 * controls stay in AppKit; this reserves their space in the 44px content row. */
export const WindowTitlebar = ({ className, ...props }: ComponentProps<'header'>) => (
  <header
    {...props}
    data-tauri-drag-region
    className={cn(
      'toolbar relative z-10 h-11 min-h-11 shrink-0 select-none items-center border-b border-border/80 bg-background px-3 sm:px-4',
      'group-data-[platform=macos]/shell:pl-28 group-data-[platform=macos]/shell:group-data-[fullscreen=true]/shell:pl-5',
      'group-data-[platform=windows]/shell:pr-32 group-data-[platform=linux]/shell:pr-32',
      'group-data-[focused=false]/shell:bg-secondary group-data-[focused=false]/shell:[&_.document-title]:opacity-65 group-data-[focused=false]/shell:[&_.toolbar-actions]:opacity-65',
      className,
    )}
  />
)
