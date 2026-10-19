import { useMessages } from '@renderer/i18n/useMessages'
import { DialogContent } from '@renderer/components/DialogContent'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { SettingsGeneral } from '@renderer/components/settings/SettingsGeneral'
import { SettingsCanvas } from '@renderer/components/settings/SettingsCanvas'
import { SettingsAbout } from '@renderer/components/settings/SettingsAbout'
import { KeyboardShortcutsContent } from '@renderer/components/settings/KeyboardShortcutsContent'

export interface SettingsDialogProps {
  readonly onClose: () => void
}

const SettingsDialog = ({ onClose }: SettingsDialogProps) => {
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
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLButtonElement>('[data-settings-trigger]')?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate('applicationSettings')}</DialogTitle>
          <DialogDescription>{translate('settingsDescription')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="min-h-0 flex-1 gap-5">
          <TabsList
            aria-label={translate('applicationSettings')}
            className="grid w-full shrink-0 grid-cols-4"
          >
            {sections.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {translate(label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="h-72 min-h-0 overflow-y-auto px-0.5 py-1">
            <TabsContent value="general">
              <SettingsGeneral />
            </TabsContent>
            <TabsContent value="canvas">
              <SettingsCanvas />
            </TabsContent>
            <TabsContent value="shortcuts">
              <KeyboardShortcutsContent />
            </TabsContent>
            <TabsContent value="about">
              <SettingsAbout />
            </TabsContent>
          </div>
        </Tabs>
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={onClose}>{translate('settingsDone')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default SettingsDialog
