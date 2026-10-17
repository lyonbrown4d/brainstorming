import { useMessages } from '@renderer/i18n/useMessages'

import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { DialogClose, DialogContent as BaseDialogContent } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

/** Business composition: keep the downloaded primitive and its public API untouched. */
export const DialogContent = ({
  closeLabel: suppliedCloseLabel,
  children,
  className = '',
  ...props
}: Omit<ComponentProps<typeof BaseDialogContent>, 'showCloseButton'> & { closeLabel?: string }) => {
  const { translate } = useMessages()
  const closeLabel = suppliedCloseLabel ?? translate('close')

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
