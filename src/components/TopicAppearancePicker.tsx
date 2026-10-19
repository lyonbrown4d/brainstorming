import { useState } from 'react'
import { Check, ChevronDown, ImageIcon, Type } from 'lucide-react'
import type { TopicShape } from '@core/types'
import { useMessages } from '@renderer/i18n/useMessages'
import type { MessageKey } from '@renderer/i18n'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'

const appearanceGroups: readonly { label: MessageKey; shapes: readonly TopicShape[] }[] = [
  {
    label: 'basicAppearances',
    shapes: ['rounded', 'rectangle', 'ellipse', 'text', 'capsule', 'circle'],
  },
  {
    label: 'expressiveAppearances',
    shapes: ['diamond', 'hexagon', 'cloud', 'speech', 'flag', 'bookmark', 'tag'],
  },
  { label: 'contentAppearances', shapes: ['sticky', 'card', 'image'] },
]
const labels: Record<TopicShape, MessageKey> = {
  rounded: 'appearanceRounded',
  rectangle: 'appearanceRectangle',
  ellipse: 'appearanceEllipse',
  text: 'appearanceText',
  capsule: 'appearanceCapsule',
  circle: 'appearanceCircle',
  diamond: 'appearanceDiamond',
  hexagon: 'appearanceHexagon',
  cloud: 'appearanceCloud',
  speech: 'appearanceSpeech',
  flag: 'appearanceFlag',
  bookmark: 'appearanceBookmark',
  tag: 'appearanceTag',
  sticky: 'appearanceSticky',
  card: 'appearanceCard',
  image: 'appearanceImage',
}

const AppearanceThumbnail = ({ shape }: { shape: TopicShape }) => {
  if (shape === 'text') return <Type className="h-6 w-10" aria-hidden />
  if (shape === 'image') return <ImageIcon className="h-6 w-10" aria-hidden />
  return (
    <TopicShapeVisual shape={shape} fill="transparent" stroke="currentColor" className="h-6 w-10" />
  )
}

export const TopicAppearancePicker = ({
  value,
  onChange,
}: {
  value: TopicShape
  onChange: (shape: TopicShape) => void
}) => {
  const { translate } = useMessages()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const groups = appearanceGroups.map((group) => ({
    ...group,
    shapes: group.shapes.filter((shape) =>
      `${translate(labels[shape])} ${shape}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    ),
  }))
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-xs"
          aria-label={translate('topicAppearance')}
        >
          <span className="flex items-center gap-2">
            <TopicShapeVisual
              shape={value}
              fill="transparent"
              stroke="currentColor"
              className="h-5 w-7"
            />
            {translate(labels[value])}
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[70] w-80 p-3"
        aria-label={translate('topicAppearance')}
      >
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
          placeholder={translate('searchTopicAppearances')}
          aria-label={translate('searchTopicAppearances')}
          className="mb-3 h-8 text-xs"
        />
        <div className="max-h-80 overflow-y-auto">
          {groups.map(
            (group) =>
              group.shapes.length > 0 && (
                <section
                  key={group.label}
                  className="mb-3 last:mb-0"
                  aria-label={translate(group.label)}
                >
                  <h3 className="mb-2 text-[10px] font-medium text-muted-foreground">
                    {translate(group.label)}
                  </h3>
                  <div className="grid grid-cols-3 gap-1.5">
                    {group.shapes.map((shape) => (
                      <Button
                        key={shape}
                        variant="ghost"
                        aria-pressed={value === shape}
                        className="relative h-16 flex-col gap-1 rounded-lg border border-border p-1 text-[10px] aria-pressed:border-primary aria-pressed:bg-accent"
                        onClick={() => {
                          onChange(shape)
                          setQuery('')
                          setOpen(false)
                        }}
                      >
                        <AppearanceThumbnail shape={shape} />
                        {translate(labels[shape])}
                        {value === shape && <Check className="absolute top-1 right-1 size-3" />}
                      </Button>
                    ))}
                  </div>
                </section>
              ),
          )}
          {groups.every((group) => !group.shapes.length) && (
            <p role="status" className="py-6 text-center text-xs text-muted-foreground">
              {translate('noMatchingAppearances')}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
