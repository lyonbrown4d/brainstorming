import { AudioLines, CheckCircle2, Circle, Link2, Sigma, Tag } from 'lucide-react'
import type { TopicMetadata } from '@core'
import { Button } from '@renderer/components/ui/button'
import { openTopicLink } from '@renderer/components/metadata/LinkPanel'
export const TopicMetadataBadges = ({ metadata }: { metadata: TopicMetadata | undefined }) => {
  if (!metadata) return null
  const { task, labels = [], link, equation, audioAssetId } = metadata
  if (!task && !labels.length && !link && !equation && !audioAssetId) return null
  return (
    <div
      className="nodrag nopan flex h-6 max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden px-2 text-[10px] opacity-85"
      aria-label="主题标签与任务"
    >
      {task && (
        <span
          className="flex shrink-0 items-center gap-0.5"
          title={`任务${task.done ? '已完成' : '未完成'}${task.priority ? ` · 优先级 ${task.priority}` : ''}${task.due ? ` · 截止 ${task.due}` : ''}`}
        >
          {task.done ? (
            <CheckCircle2 className="size-3" aria-label="任务已完成" />
          ) : (
            <Circle className="size-3" aria-label="任务未完成" />
          )}
          {task.progress !== undefined && `${task.progress}%`}
          {task.priority && <span>P{task.priority}</span>}
        </span>
      )}
      {labels.length > 0 && (
        <span className="flex min-w-0 items-center gap-0.5" title={labels.join('、')}>
          <Tag className="size-3 shrink-0" />
          <span className="max-w-24 truncate">{labels[0]}</span>
          {labels.length > 1 && `+${labels.length - 1}`}
        </span>
      )}
      {link && (
        <Button
          className="pointer-events-auto size-5 shrink-0 p-0 text-inherit"
          variant="ghost"
          size="icon"
          aria-label="打开主题链接"
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            openTopicLink(link)
          }}
        >
          <Link2 className="size-3" />
        </Button>
      )}
      {equation && <Sigma className="size-3 shrink-0" aria-label="包含公式" />}
      {audioAssetId && <AudioLines className="size-3 shrink-0" aria-label="包含音频" />}
    </div>
  )
}
