import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

type DockActionProps = ComponentProps<typeof Button> & {
  caption: string
  children: ReactNode
}

/** Canvas action cell. The caption is part of the button's stable hit target. */
export function DockAction({ caption, children, className, ...props }: DockActionProps) {
  return (
    <Button
      variant="ghost"
      data-dock-action=""
      className={cn(
        'h-12 min-w-11 shrink-0 flex-col gap-1 rounded-xl border-transparent bg-transparent px-2 text-[11px] leading-none font-normal text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent aria-pressed:bg-accent aria-pressed:text-accent-foreground [&_svg]:size-[18px]',
        className,
      )}
      {...props}
    >
      {children}
      <span>{caption}</span>
    </Button>
  )
}
