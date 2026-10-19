import { KeyboardShortcutsContent } from '@renderer/components/settings/KeyboardShortcutsContent'
import { useMessages } from '@renderer/i18n/useMessages'

import { DialogContent } from '@renderer/components/DialogContent'
import { CircleHelp } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'

export const KeyboardHelp = () => {
  const { translate } = useMessages()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={translate('keyboardShortcuts')}>
          <CircleHelp size={14} />
          {translate('shortcuts')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={translate('closeShortcuts')}>
        <DialogHeader>
          <DialogTitle>{translate('keyboardShortcuts')}</DialogTitle>
          <DialogDescription>{translate('clickToSelectATopicWhileEditing')}</DialogDescription>
        </DialogHeader>
        <KeyboardShortcutsContent />
      </DialogContent>
    </Dialog>
  )
}
