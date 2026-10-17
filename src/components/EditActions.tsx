import { useMessages } from '@renderer/i18n/useMessages'

import { Copy, CopyPlus, Scissors, ClipboardPaste, Search } from 'lucide-react'
import {
  copySelectedTopics,
  duplicateSelectedTopics,
  pasteSelectedTopics,
} from '@renderer/state/clipboard'
import { useSearch } from '@renderer/state/search'
import { DockAction } from '@renderer/components/DockAction'

export const EditActions = () => {
  const { translate } = useMessages()

  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={translate('topicEditingActions')}
    >
      {[
        {
          title: translate('copyTopic'),
          caption: translate('copy'),
          Icon: Copy,
          action: () => copySelectedTopics(),
        },
        {
          title: translate('cutTopic'),
          caption: translate('cut'),
          Icon: Scissors,
          action: () => copySelectedTopics(true),
        },
        {
          title: translate('pasteTopic'),
          caption: translate('paste'),
          Icon: ClipboardPaste,
          action: pasteSelectedTopics,
        },
        {
          title: translate('duplicateTopic'),
          caption: translate('duplicate'),
          Icon: CopyPlus,
          action: duplicateSelectedTopics,
        },
      ].map(({ title, caption, Icon, action }) => (
        <DockAction
          key={title}
          caption={caption}
          aria-label={title}
          title={title}
          onClick={() => {
            action()
          }}
        >
          <Icon className="size-4" />
        </DockAction>
      ))}
      <DockAction
        caption={translate('find')}
        aria-label={translate('findAndReplace')}
        title={translate('findAndReplace')}
        onClick={() => {
          useSearch.setState({ open: true })
        }}
      >
        <Search className="size-4" />
      </DockAction>
    </div>
  )
}
