import { useMessages } from '@renderer/i18n/useMessages'
import { DialogContent } from '@renderer/components/DialogContent'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import { SettingsGeneral } from '@renderer/components/settings/SettingsGeneral'
import { SettingsCanvas } from '@renderer/components/settings/SettingsCanvas'
import { SettingsAbout } from '@renderer/components/settings/SettingsAbout'
import { KeyboardShortcutsContent } from '@renderer/components/settings/KeyboardShortcutsContent'

export interface SettingsDialogProps {
  readonly onClose: () => void
  readonly initialSection?: 'general' | 'shortcuts'
}

const SettingsDialog = ({ onClose, initialSection = 'general' }: SettingsDialogProps) => {
  const { translate } = useMessages()
  const sections = [
    ['general', 'settingsGeneral'],
    ['canvas', 'settingsCanvas'],
    ['shortcuts', 'settingsShortcuts'],
    ['about', 'settingsAbout'],
  ] as const
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        closeLabel={translate('closeApplicationSettings')}
        className="flex h-[min(40rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-4 overflow-hidden p-5 sm:max-w-2xl sm:gap-5 sm:p-6"
        onEscapeKeyDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-shortcut-recording="true"]')
          )
            event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLButtonElement>('[data-settings-trigger]')?.focus()
        }}
      >
        <DialogHeader className="shrink-0 gap-1.5 pr-8 text-left">
          <DialogTitle className="text-lg tracking-tight">
            {translate('applicationSettings')}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {translate('settingsDescription')}
          </DialogDescription>
        </DialogHeader>
        <Tabs key={initialSection} defaultValue={initialSection} className="min-h-0 flex-1 gap-4">
          <TabsList
            aria-label={translate('applicationSettings')}
            className="grid h-10 w-full shrink-0 grid-cols-4 rounded-lg bg-secondary/70 p-1"
          >
            {sections.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="text-xs">
                {translate(label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="min-h-0 flex-1 px-0.5">
            <TabsContent value="general" className="h-full min-h-0">
              <ScrollArea className="h-full">
                <SettingsGeneral />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="canvas" className="h-full min-h-0">
              <ScrollArea className="h-full">
                <SettingsCanvas />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="shortcuts" className="h-full min-h-0">
              <KeyboardShortcutsContent />
            </TabsContent>
            <TabsContent value="about" className="h-full min-h-0">
              <ScrollArea className="h-full">
                <SettingsAbout />
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
        <div className="flex shrink-0 justify-end border-t border-border pt-4">
          <Button className="min-w-20" onClick={onClose}>
            {translate('settingsDone')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default SettingsDialog
