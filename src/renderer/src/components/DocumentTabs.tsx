import { useMessages } from '@renderer/i18n/useMessages'
import { FileText, Plus, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { DockToolbar } from '@renderer/components/DockToolbar'
import { useDocumentTabs, switchDocumentTab, closeDocumentTab } from '@renderer/state/documentTabs'
import { editorIsDirty, useEditor } from '@renderer/state/editor'
import { beginCreation } from '@renderer/state/creation'

export const DocumentTabs = () => {
  const { translate } = useMessages()
  const tabs = useDocumentTabs((state) => state.tabs)
  const activeId = useDocumentTabs((state) => state.activeId)
  const busy = useEditor((state) => state.busy)
  if (!tabs.length) return null
  return (
    <DockToolbar
      edge="top"
      label={translate('expandMapTabs')}
      caption={translate('openMaps')}
      id="open-map-tabs"
      pinInteraction={false}
    >
      <div className="flex h-12 w-max items-center gap-1">
        <Tabs value={activeId ?? ''} onValueChange={switchDocumentTab}>
          <TabsList
            aria-label={translate('openMaps')}
            className="h-9 w-max justify-start gap-1 bg-transparent p-0"
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="group flex max-w-60 min-w-32 shrink-0 items-center rounded-xl border border-transparent has-[[data-state=active]]:border-border has-[[data-state=active]]:bg-accent"
              >
                <TabsTrigger
                  value={tab.id}
                  disabled={busy}
                  aria-label={tab.editor.workbook.title}
                  className="h-8 min-w-0 justify-start gap-2 rounded-lg border-0 bg-transparent px-2.5 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs">{tab.editor.workbook.title}</span>
                  {editorIsDirty(tab.editor) && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      aria-label={translate('unsaved')}
                    />
                  )}
                </TabsTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-0.5 size-6 shrink-0 rounded-full"
                  aria-label={translate('closeMapTab', { title: tab.editor.workbook.title })}
                  disabled={busy}
                  onClick={() => {
                    closeDocumentTab(tab.id)
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-full"
          aria-label={translate('newMapTab')}
          disabled={busy}
          onClick={() => {
            beginCreation('document')
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </DockToolbar>
  )
}
