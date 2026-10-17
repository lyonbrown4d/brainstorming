import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import {
  useAnnotationInteraction,
  type AnnotationSelection,
} from '@renderer/state/annotationInteraction'
import { TopicProperties } from '@renderer/components/TopicProperties'
import { CanvasProperties } from '@renderer/components/documents/CanvasProperties'
import { AnnotationStyleControls } from '@renderer/components/annotations/AnnotationStyleControls'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'

export const Inspector = () => {
  const { translate } = useMessages()

  const sheetId = useEditor((state) => state.activeSheetId)
  const selection = useAnnotationInteraction((state) => state.selected)
  const annotation = selection?.sheetId === sheetId ? selection : null
  const editingId = useEditor((state) => state.editingId)
  const editingSurface = useEditor((state) => state.editingSurface)
  const [choice, setChoice] = useState<{
    mode: 'topic' | 'canvas'
    annotation: AnnotationSelection | null
  }>({
    mode: 'topic',
    annotation: null,
  })
  const mode =
    (editingId && editingSurface === 'inspector') ||
    (annotation && choice.annotation !== annotation)
      ? 'topic'
      : choice.mode
  return (
    <aside
      className="flex min-h-0 w-[256px] shrink-0 basis-[256px] flex-col border-l border-border bg-background text-sm"
      aria-label={translate('propertiesPanel')}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-semibold">{translate('properties')}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={translate('closePropertiesPanel')}
          onClick={() => {
            useEditor.setState({ inspectorOpen: false })
          }}
        >
          <ChevronRight size={19} />
        </Button>
      </div>
      <Tabs
        value={mode}
        onValueChange={(value) => {
          if (value === 'topic' || value === 'canvas') setChoice({ mode: value, annotation })
        }}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <TabsList
          aria-label={translate('propertyCategories')}
          className="mx-4 mt-4 mb-2 grid w-auto shrink-0 grid-cols-2"
        >
          <TabsTrigger value="topic" className="text-xs">
            {translate('topic')}
          </TabsTrigger>
          <TabsTrigger value="canvas" className="text-xs">
            {translate('sheet')}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="topic"
          forceMount
          hidden={mode !== 'topic'}
          tabIndex={mode === 'topic' ? 0 : -1}
          aria-label={translate('topicProperties')}
          className="min-h-0 overflow-y-auto px-4 pb-5"
        >
          {annotation ? <AnnotationStyleControls inline /> : <TopicProperties />}
        </TabsContent>
        <TabsContent
          value="canvas"
          forceMount
          hidden={mode !== 'canvas'}
          tabIndex={mode === 'canvas' ? 0 : -1}
          aria-label={translate('sheetProperties')}
          className="min-h-0 overflow-y-auto px-4 pb-5"
        >
          <CanvasProperties />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
