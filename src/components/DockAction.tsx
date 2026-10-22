import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'

type DockActionProps = ComponentProps<typeof Button> & {
  caption: string
  children: ReactNode
}

/** Canvas action cell. The caption is part of the button's stable hit target. */
export const DockAction = ({ caption, children, className, ...props }: DockActionProps) => {
  return (
    <Button
      variant="ghost"
      data-dock-action=""
      className={cn(
        'h-12 min-w-12 shrink-0 flex-col gap-1 rounded-lg border-transparent bg-transparent px-2 text-[11px] leading-none font-medium text-secondary-foreground shadow-none transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97] active:bg-secondary focus-visible:bg-accent focus-visible:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground [&_svg]:size-[18px]',
        className,
      )}
      {...props}
    >
      {children}
      <span>{caption}</span>
    </Button>
  )
}
