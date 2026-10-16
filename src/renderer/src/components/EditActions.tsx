import { Copy, CopyPlus, Scissors, ClipboardPaste, Search } from 'lucide-react'
import {
  copySelectedTopics,
  duplicateSelectedTopics,
  pasteSelectedTopics,
} from '../state/clipboard'
import { useSearch } from '../state/search'
import { Button } from './ui/button'

export function EditActions() {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="主题编辑操作">
      {[
        { title: '复制主题', Icon: Copy, action: () => copySelectedTopics() },
        { title: '剪切主题', Icon: Scissors, action: () => copySelectedTopics(true) },
        { title: '粘贴主题', Icon: ClipboardPaste, action: pasteSelectedTopics },
        { title: '创建主题副本', Icon: CopyPlus, action: duplicateSelectedTopics },
      ].map(({ title, Icon, action }) => (
        <Button
          key={title}
          size="icon"
          variant="ghost"
          aria-label={title}
          title={title}
          onClick={() => void action()}
        >
          <Icon className="size-4" />
        </Button>
      ))}
      <Button
        size="icon"
        variant="ghost"
        aria-label="查找与替换"
        title="查找与替换"
        onClick={() => {
          useSearch.setState({ open: true })
        }}
      >
        <Search className="size-4" />
      </Button>
    </div>
  )
}
