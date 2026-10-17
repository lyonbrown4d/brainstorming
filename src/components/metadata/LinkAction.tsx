import { useMessages } from '@renderer/i18n/useMessages'

import { Popover } from 'radix-ui'
import { Link } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { DockAction } from '@renderer/components/DockAction'
import { LinkPanel } from '@renderer/components/metadata/LinkPanel'

export const LinkAction = () => {
  const { translate } = useMessages()

  const id = useEditor((state) => state.selectedId)
  const metadata = useEditor((state) => state.history.document.topics[id]?.metadata)
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <DockAction
          caption={translate('link')}
          aria-label={translate('topicHyperlink')}
          title={translate('topicHyperlink')}
        >
          <Link className="size-4" />
        </DockAction>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={12}
          className="z-50 max-h-[70vh] w-72 overflow-auto rounded-xl border bg-popover p-4 shadow-lg"
          aria-label={translate('topicHyperlink')}
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
