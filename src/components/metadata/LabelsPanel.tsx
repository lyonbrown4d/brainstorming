import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { TopicMetadata } from '@core'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { setMetadataField } from '@renderer/components/metadata/commands'
export const LabelsPanel = ({
  topicId,
  metadata,
}: {
  topicId: string
  metadata: TopicMetadata
}) => {
  const { translate } = useMessages()

  const [label, setLabel] = useState('')
  const labels = metadata.labels ?? []
  return (
    <section className="space-y-3 border-t border-border py-4">
      <h3 className="text-sm font-medium">{translate('labels')}</h3>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const value = label.trim()
          if (
            value &&
            !labels.includes(value) &&
            setMetadataField(topicId, 'labels', [...labels, value])
          )
            setLabel('')
        }}
      >
        <Input
          aria-label={translate('newLabel')}
          placeholder={translate('addLabel')}
          maxLength={64}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value)
          }}
        />
        <Button
          variant="outline"
          size="sm"
          type="submit"
          disabled={!label.trim() || labels.length >= 32}
        >
          {translate('add')}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1">
        {labels.map((value) => (
          <Badge key={value} variant="secondary" className="max-w-full gap-1">
            <span className="truncate">{value}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-4"
              aria-label={translate('removeLabelValue0', { value0: value })}
              onClick={() => {
                setMetadataField(
                  topicId,
                  'labels',
                  labels.filter((item) => item !== value),
                )
              }}
            >
              <X className="size-3" />
            </Button>
          </Badge>
        ))}
      </div>
    </section>
  )
}
