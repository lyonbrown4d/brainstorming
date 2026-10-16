import type { PresentationStep } from '@core'
import { useEffect, useState } from 'react'
import { Popover } from 'radix-ui'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ListOrdered,
  Play,
  Plus,
  Square,
  Trash2,
} from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useEditor } from '../../state/editor'
import { selectedTopicIds } from '../../state/selection'
import { showPresentationStep, stopPresentation, usePresentation } from '../../state/presentation'
import { useSpatialView } from '../../state/spatial'
import { isCompositionKey } from '../../state/keyboard'
import { runAnnotationCommand } from '../annotations/commands'
import { Button } from '../ui/button'

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
              添加所选主题；三维视图会记录当前视角。播放时方向键或空格切换，Esc 退出。
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={add}>
                <Plus className="size-3" />
                添加所选主题步骤
              </Button>
              <Button
                size="sm"
                disabled={!steps.length}
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
            {!steps.length && <p className="text-xs text-muted-foreground">尚未添加演示步骤。</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}

export function PresentationPlayback() {
  const flow = useReactFlow()
  const document = useEditor((state) => state.history.document)
  const sheetId = useEditor((state) => state.activeSheetId)
  const workbookId = useEditor((state) => state.workbook.id)
  const presentation = usePresentation()
  const steps = document.presentation ?? emptySteps
  const playing =
    presentation.playing &&
    presentation.sheetId === sheetId &&
    presentation.workbookId === workbookId
  useEffect(() => {
    if (!playing) return
    const panel = window.document.getElementById('sheet-panel')
    panel?.setAttribute('tabindex', '-1')
    panel?.focus()
    return () => {
      panel?.removeAttribute('tabindex')
    }
  }, [playing])
  useEffect(() => {
    if (presentation.playing && (!playing || !steps[presentation.index])) stopPresentation()
  }, [playing, presentation.playing, presentation.index, steps])
  useEffect(() => {
    if (!playing) return
    const step = steps[presentation.index]
    if (step && useSpatialView.getState().sheets[sheetId]?.mode !== '3d')
      void flow.fitView({
        nodes: [{ id: step.topicId }],
        padding: 0.5,
        minZoom: 0.4,
        maxZoom: 1.2,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
      })
  }, [flow, playing, presentation.index, sheetId, steps])
  useEffect(() => {
    if (!playing) return
    const handler = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        isCompositionKey(event) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input,textarea,select,[role="dialog"],[role="menu"]'))
      )
        return
      if (!['ArrowLeft', 'ArrowRight', ' ', 'Escape'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') stopPresentation()
      else
        showPresentationStep(
          Math.max(
            0,
            Math.min(steps.length - 1, presentation.index + (event.key === 'ArrowLeft' ? -1 : 1)),
          ),
        )
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
    }
  }, [playing, presentation.index, steps.length])
  return (
    <>
      {playing && (
        <div
          className="absolute top-20 right-4 z-30 flex items-center gap-2 rounded-xl border bg-background p-2 shadow-lg"
          role="toolbar"
          aria-label="演示播放控制"
        >
          <ListOrdered className="size-4" />
          <span className="text-xs">
            {presentation.index + 1} / {steps.length}
          </span>
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
            disabled={presentation.index >= steps.length - 1}
            onClick={() => {
              showPresentationStep(presentation.index + 1)
            }}
          >
            <ArrowRight className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="退出演示" onClick={stopPresentation}>
            <Square className="size-4" />
          </Button>
        </div>
      )}
    </>
  )
}
