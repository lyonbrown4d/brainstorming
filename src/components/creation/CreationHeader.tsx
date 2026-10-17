import { BrandLogo } from '@renderer/components/BrandLogo'
import { WindowTitlebar } from '@renderer/components/WindowTitlebar'
import { WindowControls } from '@renderer/components/WindowControls'
import { useMessages } from '@renderer/i18n/useMessages'

import { LanguageMenu } from '@renderer/components/LanguageMenu'
import { AppAppearance } from '@renderer/components/appearance/AppAppearance'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperSeparator,
  StepperTitle,
} from '@renderer/components/ui/stepper'

interface CreationHeaderProps {
  step: 1 | 2
  busy: boolean
  onOpen?: () => void
  onCancel?: () => void
  cancelLabel?: string
}

export const CreationHeader = ({
  step,
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
        <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BrandLogo />
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
            <ArrowLeft data-icon="inline-start" />
            <span className="hidden lg:inline">{cancelLabel}</span>
          </Button>
        )}
      </div>
      <Stepper
        value={String(step)}
        nonInteractive
        aria-label={translate('creationSteps')}
        className="pointer-events-none absolute left-1/2 w-[168px]! -translate-x-1/2"
      >
        <StepperList role="list" tabIndex={-1} className="gap-10">
          {([translate('chooseStructureLabel463'), translate('setUpSheet')] as const).map(
            (label, index) => (
              <StepperItem
                key={label}
                value={String(index + 1)}
                role="listitem"
                aria-current={step === index + 1 ? 'step' : undefined}
                className="w-16 flex-none! flex-col gap-0.5 text-muted-foreground data-[state=active]:text-primary"
              >
                <StepperIndicator className="size-6 border-0 bg-secondary text-xs">
                  {index + 1}
                </StepperIndicator>
                <StepperTitle className="text-xs font-normal">{label}</StepperTitle>
                <StepperSeparator className="absolute top-3 left-[calc(50%+1.25rem)] w-16" />
              </StepperItem>
            ),
          )}
        </StepperList>
      </Stepper>
      <div className="toolbar-actions flex items-center gap-2">
        <LanguageMenu />
        <AppAppearance />
        {onOpen && (
          <Button
            variant="outline"
            className="border-border"
            aria-label={translate('openLocalFile')}
            disabled={busy}
            onClick={onOpen}
          >
            <FolderOpen data-icon="inline-start" />
            <span className="hidden sm:inline">{translate('openLocalFile')}</span>
            <span className="sm:hidden">{translate('open')}</span>
          </Button>
        )}
      </div>
      <WindowControls />
    </WindowTitlebar>
  )
}
