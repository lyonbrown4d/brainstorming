import { Copy, CopyPlus, Scissors, ClipboardPaste, Search } from 'lucide-react'
import {
  copySelectedTopics,
  duplicateSelectedTopics,
  pasteSelectedTopics,
} from '../state/clipboard'
import { useSearch } from '../state/search'
import { DockAction } from './DockAction'

export function EditActions() {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="主题编辑操作">
      {[
        { title: '复制主题', caption: '复制', Icon: Copy, action: () => copySelectedTopics() },
        {
          title: '剪切主题',
          caption: '剪切',
          Icon: Scissors,
          action: () => copySelectedTopics(true),
        },
        { title: '粘贴主题', caption: '粘贴', Icon: ClipboardPaste, action: pasteSelectedTopics },
        { title: '创建主题副本', caption: '副本', Icon: CopyPlus, action: duplicateSelectedTopics },
      ].map(({ title, caption, Icon, action }) => (
        <DockAction
          key={title}
          caption={caption}
          aria-label={title}
          title={title}
          onClick={() => void action()}
        >
          <Icon className="size-4" />
        </DockAction>
      ))}
      <DockAction
        caption="查找"
        aria-label="查找与替换"
        title="查找与替换"
        onClick={() => {
          useSearch.setState({ open: true })
        }}
      >
        <Search className="size-4" />
      </DockAction>
    </div>
  )
}
