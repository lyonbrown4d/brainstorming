import { MessageSquareText } from 'lucide-react'
import { PlainTextInput } from '@renderer/components/inputs/PlainTextInput'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import {
  isPresentationNoteDraft,
  startPresentationNotes,
  type PresentationNoteTarget,
} from '@renderer/state/presentationEditing'

interface PresentationNotesProps {
  notes: string
  disabled: boolean
  target: PresentationNoteTarget
}

/** Live notes share the save/recovery draft; committing creates one history entry. */
export const PresentationNotes = ({ notes, disabled, target }: PresentationNotesProps) => {
  const { translate } = useMessages()
  const draft = useEditor((state) => (isPresentationNoteDraft(state, target) ? state.draft : notes))
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <label
        htmlFor="presentation-notes"
        className="mb-2 flex items-center gap-2 text-sm font-medium"
      >
        <MessageSquareText className="size-4" />
        {translate('presentationNotes')}
      </label>
      <PlainTextInput
        id="presentation-notes"
        className="min-h-14 resize-y border-0 p-0 shadow-none focus-visible:ring-0"
        label={translate('presentationNotes')}
        value={draft}
        disabled={disabled}
        maxLength={10_000}
        placeholder={translate('presentationNotesPlaceholder')}
        onFocus={() => {
          startPresentationNotes(target)
        }}
        onValueChange={(value) => {
          if (startPresentationNotes(target)) useEditor.getState().setDraft(value)
        }}
        onBlur={(value) => {
          const state = useEditor.getState()
          if (isPresentationNoteDraft(state, target)) {
            state.setDraft(value)
            state.commitDraft()
          }
        }}
      />
    </div>
  )
}
