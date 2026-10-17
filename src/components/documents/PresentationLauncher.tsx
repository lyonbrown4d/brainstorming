import { useMessages } from '@renderer/i18n/useMessages'

import { Play } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { PresentationControls } from '@renderer/components/documents/PresentationControls'
import { showPresentationStep } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'

export const PresentationLauncher = () => {
  const { translate } = useMessages()

  const busy = useEditor((state) => state.busy)
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      role="group"
      aria-label={translate('presentation')}
    >
      <Button
        variant="ghost"
        className="h-8 gap-1.5 px-2"
        aria-label={translate('startPresentation')}
        title={translate('startPresentation')}
        disabled={busy}
        onClick={() => {
          showPresentationStep(0)
        }}
      >
        <Play className="size-4" />
        <span className="hidden min-[1100px]:inline">{translate('presentation')}</span>
      </Button>
      <PresentationControls />
    </div>
  )
}
