import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { DialogClose, DialogContent as BaseDialogContent } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

/** Business composition: keep the downloaded primitive and its public API untouched. */
export const DialogContent = ({
  closeLabel = '关闭',
  children,
  className = '',
  ...props
}: Omit<ComponentProps<typeof BaseDialogContent>, 'showCloseButton'> & { closeLabel?: string }) => {
  return (
    <BaseDialogContent {...props} showCloseButton={false} className={`trelyx-dialog ${className}`}>
      {children}
      <DialogClose asChild>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3"
          aria-label={closeLabel}
        >
          <X size={16} />
        </Button>
      </DialogClose>
    </BaseDialogContent>
  )
}
