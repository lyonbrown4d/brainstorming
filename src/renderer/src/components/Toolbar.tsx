import { Check, ListTree, Network, SlidersHorizontal } from 'lucide-react'
import { useEditor, editorIsDirty } from '@renderer/state/editor'
import { showWorkspaceHome } from '@renderer/state/creation'
import { useSpatialView } from '@renderer/state/spatial'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { ToolbarFileMenu } from '@renderer/components/ToolbarFileMenu'
import { ViewModeSwitch } from '@renderer/components/ViewModeSwitch'

export const Toolbar = () => {
  const path = useEditor((state) => state.path)
  const busy = useEditor((state) => state.busy)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const dirty = useEditor(editorIsDirty)
  const sheetId = useEditor((state) => state.activeSheetId)
  const spatial = useSpatialView((state) => state.sheets[sheetId]?.mode === '3d')
  return (
    <header className="toolbar relative z-10 grid h-14 min-h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background px-3 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 xl:gap-4">
        <Button
          variant="ghost"
          className="shrink-0 gap-2 px-0 text-xl font-semibold tracking-tight"
          aria-label="返回首页"
          disabled={busy}
          onClick={showWorkspaceHome}
        >
          <Network data-icon="inline-start" className="text-primary" strokeWidth={1.7} />
          <span className="hidden min-[1100px]:inline">Trelyx</span>
        </Button>
        <Separator
          orientation="vertical"
          className="hidden data-[orientation=vertical]:h-5 min-[720px]:block"
        />
        <ToolbarFileMenu />
        <span
          className="save-status hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground min-[1280px]:inline-flex"
          title={path ?? '尚未保存为本地文件'}
          aria-live="polite"
        >
          {dirty ? (
            <span className="size-1.5 rounded-full bg-primary" />
          ) : (
            <Check className="size-3.5" />
          )}
          {busy ? '正在处理…' : dirty ? '未保存' : path ? '已保存' : '本地草稿'}
        </span>
      </div>
      <ViewModeSwitch />
      <div className="toolbar-actions flex shrink-0 items-center justify-end gap-1">
        <Button
          variant="ghost"
          className="h-8 gap-2 px-2 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label="文档大纲"
          aria-pressed={outline}
          title="文档大纲"
          onClick={() => {
            useEditor.setState({ outlineOpen: !outline })
          }}
        >
          <ListTree data-icon="inline-start" />
          <span className="hidden min-[720px]:inline">大纲</span>
        </Button>
        <Separator
          orientation="vertical"
          className="mx-1 hidden data-[orientation=vertical]:h-5 min-[720px]:block"
        />
        <Button
          variant="ghost"
          className="h-8 gap-2 px-2 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          aria-label={spatial ? '主题面板' : '样式面板'}
          aria-pressed={inspector}
          title={spatial ? '主题面板' : '样式面板'}
          onClick={() => {
            useEditor.setState({ inspectorOpen: !inspector })
          }}
        >
          <SlidersHorizontal data-icon="inline-start" />
          <span className="hidden min-[720px]:inline">属性</span>
        </Button>
      </div>
    </header>
  )
}
