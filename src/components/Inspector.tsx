import { motion, useReducedMotion } from 'motion/react'
import { useMessages } from '@renderer/i18n/useMessages'

import { ChevronRight } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { closeInspector, selectInspectorMode } from '@renderer/state/inspectorNavigation'
import { useSelectedDrawingIds, useSelectedIds } from '@renderer/state/selection'
import { InkSelectionProperties } from '@renderer/components/ink/InkSelectionProperties'
import { TopicProperties } from '@renderer/components/TopicProperties'
import { CanvasProperties } from '@renderer/components/documents/CanvasProperties'
import { AnnotationStyleControls } from '@renderer/components/annotations/AnnotationStyleControls'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'

export const Inspector = () => {
  const { translate } = useMessages()
  const reducedMotion = useReducedMotion()

  const sheetId = useEditor((state) => state.activeSheetId)
  const selection = useAnnotationInteraction((state) => state.selected)
  const annotation = selection?.sheetId === sheetId ? selection : null
  const mode = useEditor((state) => state.inspectorMode)
  const drawings = useSelectedDrawingIds()
  const topics = useSelectedIds()
  return (
    <aside
      className="flex min-h-0 w-[272px] shrink-0 basis-[272px] flex-col border-l border-border/80 bg-background text-sm"
      aria-label={translate('propertiesPanel')}
    >
      <Tabs
        value={mode}
        onValueChange={(value) => {
          if (value === 'topic' || value === 'canvas') selectInspectorMode(value)
        }}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-4">
          <h2 className="sr-only">{translate('properties')}</h2>
          <TabsList
            variant="line"
            aria-label={translate('propertyCategories')}
            className="h-11 flex-1 justify-start gap-4 p-0"
          >
            <TabsTrigger
              value="topic"
              className="h-11 flex-none rounded-none px-1 text-xs after:bottom-0 after:bg-foreground"
            >
              {translate('topic')}
            </TabsTrigger>
            <TabsTrigger
              value="canvas"
              className="h-11 flex-none rounded-none px-1 text-xs after:bottom-0 after:bg-foreground"
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
              closeInspector()
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <TabsContent
          value="topic"
          hidden={mode !== 'topic'}
          tabIndex={mode === 'topic' ? 0 : -1}
          aria-label={translate('topicProperties')}
          className="min-h-0 overflow-y-auto px-4 pb-5"
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12 }}
          >
            {annotation ? (
              <AnnotationStyleControls inline />
            ) : (
              <>
                {drawings.length > 0 && <InkSelectionProperties />}
                {(topics.length > 0 || drawings.length === 0) && <TopicProperties />}
              </>
            )}
          </motion.div>
        </TabsContent>
        <TabsContent
          value="canvas"
          hidden={mode !== 'canvas'}
          tabIndex={mode === 'canvas' ? 0 : -1}
          aria-label={translate('sheetProperties')}
          className="min-h-0 overflow-y-auto px-4 pb-5"
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12 }}
          >
            <CanvasProperties />
          </motion.div>
        </TabsContent>
      </Tabs>
    </aside>
  )
}
