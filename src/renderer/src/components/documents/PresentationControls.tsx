import type { PresentationStep } from '@core'
import { useState } from 'react'
import { Popover } from 'radix-ui'
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react'
import { useEditor } from '../../state/editor'
import { selectedTopicIds } from '../../state/selection'
import { presentationSteps, showPresentationStep, usePresentation } from '../../state/presentation'
import { useSpatialView } from '../../state/spatial'
import { runAnnotationCommand } from '../annotations/commands'
import { Button } from '../ui/button'

export { PresentationPlayback } from './PresentationPlayback'

const emptySteps: readonly PresentationStep[] = []

export function PresentationControls() {
  const [open, setOpen] = useState(false)
  const document = useEditor((state) => state.history.document)
  const steps = document.presentation ?? emptySteps
  const add = (): void => {
    const state = useEditor.getState(),
      view = useSpatialView.getState().sheets[state.activeSheetId]
    runAnnotationCommand({
      type: 'setPresentation',
      steps: [
        ...steps,
        ...selectedTopicIds(state).map((topicId) => ({
          topicId,
          ...(view?.mode === '3d' && view.camera ? { camera: view.camera } : {}),
        })),
      ],
    })
  }
  const move = (index: number, offset: number): void => {
    const next = [...steps],
      [step] = next.splice(index, 1)
    if (step) {
      next.splice(index + offset, 0, step)
      runAnnotationCommand({ type: 'setPresentation', steps: next })
    }
  }
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button variant="outline" size="sm">
            <Play className="size-4" />
            演示
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={12}
            onCloseAutoFocus={(event) => {
              if (usePresentation.getState().playing) {
                event.preventDefault()
                requestAnimationFrame(() => {
                  window.document.getElementById('sheet-panel')?.focus()
                })
              }
            }}
            className="z-50 max-h-[70vh] w-80 space-y-3 overflow-auto rounded-xl border bg-popover p-3 shadow-lg"
            aria-label="演示步骤"
          >
            <p className="text-sm font-medium">演示步骤</p>
            <p className="text-xs text-muted-foreground">
              添加所选主题；三维视图会记录当前视角。未添加时按可见主题自动演示。方向键或空格切换，Esc
              退出。
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={add}>
                <Plus className="size-3" />
                添加所选主题步骤
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  showPresentationStep(0)
                  setOpen(false)
                }}
              >
                <Play className="size-3" />
                开始演示
              </Button>
            </div>
            <ol className="space-y-1">
              {steps.map((step, index) => (
                <li
                  key={`${step.topicId}:${index}`}
                  className="flex items-center gap-1 rounded border p-1"
                >
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {index + 1}. {document.topics[step.topicId]?.title}
                    {step.camera ? ' · 3D' : ''}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    disabled={index === 0}
                    aria-label={`上移步骤 ${index + 1}`}
                    onClick={() => {
                      move(index, -1)
                    }}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    disabled={index === steps.length - 1}
                    aria-label={`下移步骤 ${index + 1}`}
                    onClick={() => {
                      move(index, 1)
                    }}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    aria-label={`移除步骤 ${index + 1}`}
                    onClick={() => {
                      runAnnotationCommand({
                        type: 'setPresentation',
                        steps: steps.filter((_, item) => item !== index),
                      })
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </li>
              ))}
            </ol>
            {!steps.length && (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>自动演示 {presentationSteps(document).length} 个可见主题，不修改文档。</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAnnotationCommand({
                      type: 'setPresentation',
                      steps: presentationSteps(document),
                    })
                  }}
                >
                  生成并保存步骤
                </Button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
