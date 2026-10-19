import { ArrowLeft, Play, Presentation } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { PresentationControls } from '@renderer/components/documents/PresentationControls'
import {
  closePresentationWorkspace,
  openPresentationComposer,
  presentationSteps,
  showPresentationStep,
  usePresentation,
} from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'

export const PresentationLauncher = () => {
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  const document = useEditor((state) => state.history.document)
  const composer = usePresentation((state) => state.workspaceMode === 'composer')
  const playable = presentationSteps(document).some((step) => !step.hidden)
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      role="group"
      aria-label={translate('presentation')}
    >
      {composer && (
        <Button
          variant="ghost"
          className="h-8 gap-1.5 px-2"
          onClick={closePresentationWorkspace}
          aria-label={translate('presentationBackToMap')}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden min-[1100px]:inline">{translate('presentationBackToMap')}</span>
        </Button>
      )}
      <Button
        variant="ghost"
        className="h-8 gap-1.5 px-2"
        aria-label={translate(composer ? 'presentationPlayFromStart' : 'presentationComposer')}
        title={translate(composer ? 'presentationPlayFromStart' : 'presentationComposer')}
        disabled={busy || (composer && !playable)}
        onClick={() => {
          if (composer) showPresentationStep(0)
          else openPresentationComposer()
        }}
      >
        {composer ? <Play className="size-4" /> : <Presentation className="size-4" />}
        <span className="hidden min-[1100px]:inline">
          {translate(composer ? 'presentationPlayFromStart' : 'presentation')}
        </span>
      </Button>
      {!composer && <PresentationControls />}
    </div>
  )
}
