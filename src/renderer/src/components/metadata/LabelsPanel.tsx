import { useState } from 'react'
import { X } from 'lucide-react'
import type { TopicMetadata } from '@core'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { setMetadataField } from './commands'
import { markerOptions } from './markers'

const markers = markerOptions

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
      <div className="flex flex-wrap gap-2" role="group" aria-label="主题图标">
        {markers.map(({ value, title, Icon }) => (
          <Button
            key={value}
            variant="outline"
            size="sm"
            aria-label={title}
            aria-pressed={currentMarkers.includes(value)}
            className="aria-pressed:bg-accent"
            onClick={() => {
              setMetadataField(
                topicId,
                'markers',
                currentMarkers.includes(value)
                  ? currentMarkers.filter((item) => item !== value)
                  : [...currentMarkers, value],
              )
            }}
          >
            <Icon className="size-4" />
            {title}
          </Button>
        ))}
        {currentMarkers
          .filter((value) => !markers.some((marker) => marker.value === value))
          .map((value) => (
            <Button
              key={value}
              variant="outline"
              size="sm"
              aria-label={`移除图标 ${value}`}
              onClick={() => {
                setMetadataField(
                  topicId,
                  'markers',
                  currentMarkers.filter((item) => item !== value),
                )
              }}
            >
              {value}
              <X className="size-3" />
            </Button>
          ))}
      </div>
    </section>
  )
}
