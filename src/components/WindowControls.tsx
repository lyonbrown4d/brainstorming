import { Minus, Square, X } from 'lucide-react'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { hasWindowControls } from '@shared/window'
import { useMessages } from '@renderer/i18n/useMessages'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'

export const WindowControls = () => {
  const api = requireDesktopAPI()
  const { translate } = useMessages()
  if (!hasWindowControls(api.platform) || api.platform === 'macos' || !api.closeWindow) return null
  const controls = [
    { key: 'minimizeWindow', Icon: Minus, action: () => api.minimizeWindow?.() },
    { key: 'maximizeWindow', Icon: Square, action: () => api.toggleMaximizeWindow?.() },
    { key: 'closeWindow', Icon: X, action: () => api.closeWindow?.() },
  ] as const
  return (
    <div
      className="absolute top-0 right-0 flex h-11 items-stretch"
      data-no-drag
      data-tauri-drag-region="false"
    >
      {controls.map(({ key, Icon, action }) => (
        <Button
          key={key}
          variant="ghost"
          className={`h-full w-10 rounded-none px-0 text-muted-foreground ${key === 'closeWindow' ? 'hover:bg-destructive hover:text-white' : 'hover:bg-accent hover:text-foreground'}`}
          aria-label={translate(key)}
          title={translate(key)}
          onClick={() => {
            void action()?.catch((error: unknown) => {
              useEditor.getState().setError(error instanceof Error ? error.message : String(error))
            })
          }}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  )
}
