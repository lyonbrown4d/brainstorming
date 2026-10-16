import { useState } from 'react'
import { X } from 'lucide-react'
import type { TopicMetadata } from '@core'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { setMetadataField, toggleTopicMarker } from './commands'
import { MarkerPicker } from './MarkerPicker'

export function LabelsPanel({ topicId, metadata }: { topicId: string; metadata: TopicMetadata }) {
  const [label, setLabel] = useState('')
  const labels = metadata.labels ?? []
  const currentMarkers = metadata.markers ?? []
  return (
    <section className="space-y-3 border-t border-border py-4">
      <h3 className="text-sm font-medium">标签与图标</h3>
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
          aria-label="新标签"
          placeholder="添加标签"
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
          添加
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
              aria-label={`移除标签 ${value}`}
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
      <MarkerPicker
        selected={currentMarkers}
        onToggle={(marker) => {
          toggleTopicMarker(topicId, marker)
        }}
      />
    </section>
  )
}
