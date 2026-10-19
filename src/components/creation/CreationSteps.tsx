import { useMessages } from '@renderer/i18n/useMessages'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperSeparator,
  StepperTitle,
} from '@renderer/components/ui/stepper'

export const CreationSteps = ({ step }: { step: 1 | 2 }) => {
  const { translate } = useMessages()
  return (
    <Stepper
      value={String(step)}
      nonInteractive
      aria-label={translate('creationSteps')}
      className="w-auto"
    >
      <StepperList role="list" tabIndex={-1} className="gap-3">
        {([translate('chooseStructureLabel463'), translate('setUpSheet')] as const).map(
          (label, index) => (
            <StepperItem
              key={label}
              value={String(index + 1)}
              role="listitem"
              aria-current={step === index + 1 ? 'step' : undefined}
              className="flex-none! gap-1.5 text-muted-foreground data-[state=active]:text-foreground"
            >
              <StepperIndicator className="size-5 border-0 bg-secondary text-[11px]">
                {index + 1}
              </StepperIndicator>
              <StepperTitle className="text-xs font-normal">{label}</StepperTitle>
              {index === 0 && <StepperSeparator className="ml-1 h-px w-5 flex-none" />}
            </StepperItem>
          ),
        )}
      </StepperList>
    </Stepper>
  )
}
