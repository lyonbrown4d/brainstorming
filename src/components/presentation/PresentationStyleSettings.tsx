import { RotateCcw } from 'lucide-react'
import type { PresentationAppearance } from '@core'
import { useMessages } from '@renderer/i18n/useMessages'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { PresentationTextSettings } from '@renderer/components/presentation/PresentationTextSettings'
import { PresentationColorField } from '@renderer/components/presentation/PresentationColorField'

export const PresentationStyleSettings = ({
  value = {},
  defaults,
  disabled,
  onChange,
  onReset,
}: {
  value: PresentationAppearance | undefined
  defaults: { background: string; title: string; body: string }
  disabled: boolean
  onChange: (value: PresentationAppearance) => void
  onReset: () => void
}) => {
  const { translate } = useMessages()
  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-label={translate('presentationStyle')}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{translate('presentationStyle')}</h3>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled || Object.keys(value).length === 0}
          onClick={onReset}
          aria-label={translate('presentationResetStyle')}
          title={translate('presentationResetStyle')}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      <Tabs defaultValue="page">
        <TabsList className="w-full">
          <TabsTrigger value="page" className="text-xs">
            {translate('presentationStylePage')}
          </TabsTrigger>
          <TabsTrigger value="title" className="text-xs">
            {translate('presentationStyleTitle')}
          </TabsTrigger>
          <TabsTrigger value="body" className="text-xs">
            {translate('presentationStyleBody')}
          </TabsTrigger>
          <TabsTrigger value="image" className="text-xs">
            {translate('presentationStyleImage')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="page" className="pt-2">
          <PresentationColorField
            key={value.background ?? defaults.background}
            label={translate('presentationBackground')}
            value={value.background ?? defaults.background}
            disabled={disabled}
            onChange={(background) => {
              onChange({ ...value, background })
            }}
          />
        </TabsContent>
        <TabsContent value="title" className="pt-2">
          <PresentationTextSettings
            value={value.title ?? {}}
            defaultColor={defaults.title}
            disabled={disabled}
            onChange={(title) => {
              onChange({ ...value, title })
            }}
          />
        </TabsContent>
        <TabsContent value="body" className="pt-2">
          <PresentationTextSettings
            value={value.body ?? {}}
            defaultColor={defaults.body}
            disabled={disabled}
            onChange={(body) => {
              onChange({ ...value, body })
            }}
          />
        </TabsContent>
        <TabsContent value="image" className="space-y-4 pt-2">
          <label className="flex items-center justify-between gap-2 text-xs">
            <span>{translate('presentationImageFit')}</span>
            <Select
              value={value.image?.fit ?? 'contain'}
              disabled={disabled}
              onValueChange={(fit) => {
                if (fit === 'contain' || fit === 'cover')
                  onChange({ ...value, image: { ...value.image, fit } })
              }}
            >
              <SelectTrigger className="h-8 w-28" aria-label={translate('presentationImageFit')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">{translate('presentationImageContain')}</SelectItem>
                <SelectItem value="cover">{translate('presentationImageCover')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span>{translate('presentationImagePosition')}</span>
            <Select
              value={value.image?.position ?? 'left'}
              disabled={disabled}
              onValueChange={(position) => {
                if (position === 'left' || position === 'right')
                  onChange({ ...value, image: { ...value.image, position } })
              }}
            >
              <SelectTrigger
                className="h-8 w-28"
                aria-label={translate('presentationImagePosition')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{translate('presentationAlignLeft')}</SelectItem>
                <SelectItem value="right">{translate('presentationAlignRight')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </TabsContent>
      </Tabs>
    </section>
  )
}
