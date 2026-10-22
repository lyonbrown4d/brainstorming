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
      <DialogContent
        closeLabel={translate('closeShortcuts')}
        className="flex h-[min(40rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden"
        onEscapeKeyDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-shortcut-recording="true"]')
          )
            event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 pr-7">
          <DialogTitle>{translate('keyboardShortcuts')}</DialogTitle>
          <DialogDescription>{translate('clickToSelectATopicWhileEditing')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <KeyboardShortcutsContent />
        </div>
      </DialogContent>
    </Dialog>
  )
}
