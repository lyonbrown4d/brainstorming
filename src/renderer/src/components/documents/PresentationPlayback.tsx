import { ArrowLeft, ArrowRight, Maximize, Minimize, Square } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { showPresentationStep, stopPresentation } from '@renderer/state/presentation'
import { usePresentationPlayback } from '@renderer/hooks/usePresentationPlayback'
import { Button } from '@renderer/components/ui/button'

export const PresentationPlayback = () => {
  const { presentation, fullscreen, toggleFullscreen } = usePresentationPlayback()
  const title = useEditor(
    (state) =>
      state.history.document.topics[presentation.steps[presentation.index]?.topicId ?? '']?.title,
  )
  if (!presentation.playing) return null
  return (
    <div
      className="absolute inset-x-4 bottom-5 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
      role="toolbar"
      aria-label="演示播放控制"
      data-presentation-controls
      tabIndex={-1}
    >
      <div className="max-w-56 px-2">
        <p className="truncate text-sm font-medium" aria-live="polite">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {presentation.index + 1} / {presentation.steps.length}
          {presentation.generated ? ' · 自动演示' : ''}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label="上一步演示"
        disabled={presentation.index === 0}
        onClick={() => {
          showPresentationStep(presentation.index - 1)
        }}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="下一步演示"
        disabled={presentation.index >= presentation.steps.length - 1}
        onClick={() => {
          showPresentationStep(presentation.index + 1)
        }}
      >
        <ArrowRight className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={fullscreen ? '退出全屏' : '全屏演示'}
        onClick={toggleFullscreen}
      >
        {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
      </Button>
      <Button size="sm" variant="outline" aria-label="退出演示" onClick={stopPresentation}>
        <Square className="size-3.5" />
        退出
      </Button>
      <span className="hidden px-1 text-xs text-muted-foreground sm:inline">
        方向键切换 · Esc 退出
      </span>
    </div>
  )
}
