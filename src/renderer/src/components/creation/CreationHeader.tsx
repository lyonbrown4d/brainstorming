import { AppAppearance } from '@renderer/components/appearance/AppAppearance'
import { ArrowLeft, FolderOpen, Network } from 'lucide-react'
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
  cancelLabel = '返回画布',
}: CreationHeaderProps) => {
  return (
    <header className="toolbar relative z-10 flex h-14 min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Network className="size-6 text-primary" strokeWidth={1.7} />
          <span className="hidden sm:inline">Trelyx</span>
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
        aria-label="创建步骤"
        className="pointer-events-none absolute left-1/2 w-[168px]! -translate-x-1/2"
      >
        <StepperList role="list" tabIndex={-1} className="gap-10">
          {(['选择结构', '设置画布'] as const).map((label, index) => (
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
          ))}
        </StepperList>
      </Stepper>
      <div className="toolbar-actions flex items-center gap-2">
        <AppAppearance />
        {onOpen && (
          <Button
            variant="outline"
            className="border-border"
            aria-label="打开本地文件"
            disabled={busy}
            onClick={onOpen}
          >
            <FolderOpen data-icon="inline-start" />
            <span className="hidden sm:inline">打开本地文件</span>
            <span className="sm:hidden">打开</span>
          </Button>
        )}
      </div>
    </header>
  )
}
