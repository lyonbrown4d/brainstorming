import { Popover } from 'radix-ui'
import { Link } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { DockAction } from '@renderer/components/DockAction'
import { LinkPanel } from '@renderer/components/metadata/LinkPanel'

export const LinkAction = () => {
  const id = useEditor((state) => state.selectedId)
  const metadata = useEditor((state) => state.history.document.topics[id]?.metadata)
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <DockAction caption="链接" aria-label="主题超链接" title="主题超链接">
          <Link className="size-4" />
        </DockAction>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          className="z-50 max-h-[70vh] w-72 overflow-auto rounded-xl border bg-popover p-4 shadow-lg"
          aria-label="主题超链接"
        >
          <LinkPanel
            key={`${id}:${JSON.stringify(metadata?.link)}`}
            topicId={id}
            metadata={metadata ?? {}}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
