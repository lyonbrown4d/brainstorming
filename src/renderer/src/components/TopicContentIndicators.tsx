import { FileText, Paperclip } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'

export const TopicContentIndicators = ({
  topicId,
  hasNotes,
  attachmentCount,
}: {
  topicId: string
  hasNotes: boolean
  attachmentCount: number
}) => {
  if (!hasNotes && attachmentCount === 0) return null
  const openInspector = (): void => {
    useEditor.getState().select(topicId)
    useEditor.setState({ inspectorOpen: true })
  }
  return (
    <div className="topic-content-indicators nodrag nopan flex h-7 shrink-0 items-center justify-center gap-1 pb-1 [&_button]:h-6 [&_button]:w-auto [&_button]:min-w-6 [&_button]:gap-[3px] [&_button]:px-[5px] [&_button]:text-[10px] [&_button]:text-inherit [&_button]:opacity-75">
      {hasNotes && (
        <Badge variant="outline" asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="查看主题备注"
            onClick={(event) => {
              event.stopPropagation()
              openInspector()
            }}
          >
            <FileText size={13} />
          </Button>
        </Badge>
      )}
      {attachmentCount > 0 && (
        <Badge variant="outline" asChild>
          <Button
            variant="ghost"
            aria-label={`查看 ${attachmentCount} 个附件`}
            onClick={(event) => {
              event.stopPropagation()
              openInspector()
            }}
          >
            <Paperclip size={13} />
            <span>{attachmentCount}</span>
          </Button>
        </Badge>
      )}
    </div>
  )
}
