import { CommandPaletteTrigger } from '@renderer/components/commands/CommandPaletteTrigger'
import { BrandLogo } from '@renderer/components/BrandLogo'
import { WindowTitlebar } from '@renderer/components/WindowTitlebar'
import { WindowControls } from '@renderer/components/WindowControls'
import { useMessages } from '@renderer/i18n/useMessages'

import { SettingsButton } from '@renderer/components/settings/SettingsButton'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
interface CreationHeaderProps {
  busy: boolean
  onOpen?: () => void
  onCancel?: () => void
  cancelLabel?: string
}

export const CreationHeader = ({
  busy,
  onOpen,
  onCancel,
  cancelLabel: suppliedCancelLabel,
}: CreationHeaderProps) => {
  const { translate } = useMessages()
  const cancelLabel = suppliedCancelLabel ?? translate('returnToCanvas')

  return (
    <WindowTitlebar className="flex justify-between gap-3">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <BrandLogo className="size-6" />
          <span className="hidden sm:inline">Brainstorming</span>
        </div>
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={cancelLabel}
            onClick={onCancel}
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            <span className="hidden lg:inline">{cancelLabel}</span>
          </Button>
        )}
      </div>
      <div className="toolbar-actions flex items-center gap-2">
        <CommandPaletteTrigger />
        <SettingsButton />
        {onOpen && (
          <Button
            variant="outline"
            size="sm"
            className="border-border"
            aria-label={translate('openLocalFile')}
            disabled={busy}
            onClick={onOpen}
          >
            <FolderOpen aria-hidden="true" data-icon="inline-start" />
            <span className="hidden sm:inline">{translate('openLocalFile')}</span>
            <span className="sm:hidden">{translate('open')}</span>
          </Button>
        )}
      </div>
      <WindowControls />
    </WindowTitlebar>
  )
}
