import { SlidersHorizontal } from 'lucide-react'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { openPresentationComposer } from '@renderer/state/presentation'
import { Button } from '@renderer/components/ui/button'

export { PresentationPlayback } from '@renderer/components/documents/PresentationPlayback'

export const PresentationControls = () => {
  const { translate } = useMessages()
  const busy = useEditor((state) => state.busy)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={translate('presentationSettings')}
      title={translate('presentationSettings')}
      disabled={busy}
      onClick={openPresentationComposer}
    >
      <SlidersHorizontal className="size-3.5" />
    </Button>
  )
}
