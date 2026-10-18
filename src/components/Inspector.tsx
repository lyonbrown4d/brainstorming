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
      className="flex min-h-0 w-[272px] shrink-0 basis-[272px] flex-col border-l border-border bg-background text-sm"
      aria-label={translate('propertiesPanel')}
    >
      <Tabs
        value={mode}
        onValueChange={(value) => {
          if (value === 'topic' || value === 'canvas') setChoice({ mode: value, annotation })
        }}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/80 px-4">
          <h2 className="sr-only">{translate('properties')}</h2>
          <TabsList
            variant="line"
            aria-label={translate('propertyCategories')}
            className="h-12 flex-1 justify-start gap-4 p-0"
          >
            <TabsTrigger
              value="topic"
              className="h-12 flex-none rounded-none px-1 text-xs after:bottom-0 after:bg-primary"
            >
              {translate('topic')}
            </TabsTrigger>
            <TabsTrigger
              value="canvas"
              className="h-12 flex-none rounded-none px-1 text-xs after:bottom-0 after:bg-primary"
            >
              {translate('sheet')}
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={translate('closePropertiesPanel')}
            onClick={() => {
              useEditor.setState({ inspectorOpen: false })
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
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
