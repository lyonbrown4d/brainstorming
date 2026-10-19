import { useState } from 'react'
import type { AnnotationKind } from '@renderer/state/annotationInteraction'
import { PlainTextInput } from '@renderer/components/inputs/PlainTextInput'
import { useMessages } from '@renderer/i18n/useMessages'

export const AnnotationLabelInput = ({
  kind,
  text,
  onCommit,
  onCancel,
}: {
  kind: AnnotationKind
  text: string
  onCommit: (value: string) => void
  onCancel: () => void
}) => {
  const { translate } = useMessages()
  const [draft, setDraft] = useState(text)
  return (
    <PlainTextInput
      label={
        kind === 'relation'
          ? translate('editRelationshipLabel')
          : kind === 'group'
            ? translate('editGroupLabel')
            : translate('editCalloutText')
      }
      className="pointer-events-auto min-h-8 max-h-60 w-48 bg-background text-xs"
      value={draft}
      onValueChange={setDraft}
      maxLength={10_000}
      focusOnMount
      selectAllOnFocus
      submitMode={kind === 'callout' ? 'modifier-enter' : 'enter'}
      onSubmit={onCommit}
      onBlur={onCommit}
      onCancel={onCancel}
    />
  )
}
