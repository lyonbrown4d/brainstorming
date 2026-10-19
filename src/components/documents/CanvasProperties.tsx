import { useMessages } from '@renderer/i18n/useMessages'

import { useEditor } from '@renderer/state/editor'
import { isCanvasSection, selectCanvasSection } from '@renderer/state/inspectorNavigation'
import { StructurePicker } from '@renderer/components/documents/StructurePicker'
import { DocumentSettingsPanel } from '@renderer/components/documents/DocumentSettingsPanel'
import { TemplateDialog } from '@renderer/components/documents/TemplateDialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'

export const CanvasProperties = () => {
  const { translate } = useMessages()

  const section = useEditor((state) => state.canvasSection)
  return (
    <Tabs
      value={section}
      onValueChange={(value) => {
        if (isCanvasSection(value)) selectCanvasSection(value)
      }}
      className="gap-0 pt-3"
    >
      <TabsList
        aria-label={translate('sheetSettings')}
        className="mb-1 grid h-8 w-full grid-cols-3 gap-0.5 p-0.5"
      >
        <TabsTrigger value="structure" className="text-xs data-[state=active]:shadow-none">
          {translate('structureLabel735')}
        </TabsTrigger>
        <TabsTrigger value="appearance" className="text-xs data-[state=active]:shadow-none">
          {translate('colors')}
        </TabsTrigger>
        <TabsTrigger value="template" className="text-xs data-[state=active]:shadow-none">
          {translate('template')}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="structure"
        forceMount
        hidden={section !== 'structure'}
        tabIndex={section === 'structure' ? 0 : -1}
      >
        <StructurePicker inline />
      </TabsContent>
      <TabsContent
        value="appearance"
        forceMount
        hidden={section !== 'appearance'}
        tabIndex={section === 'appearance' ? 0 : -1}
      >
        <DocumentSettingsPanel inline />
      </TabsContent>
      <TabsContent
        value="template"
        forceMount
        hidden={section !== 'template'}
        tabIndex={section === 'template' ? 0 : -1}
      >
        <section className="space-y-3 py-3" aria-label={translate('contentTemplate')}>
          <h3 className="text-xs font-medium text-secondary-foreground">
            {translate('contentTemplate')}
          </h3>
          <TemplateDialog />
        </section>
      </TabsContent>
    </Tabs>
  )
}
