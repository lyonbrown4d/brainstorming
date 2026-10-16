import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { MindMapDocument } from '@core'
import { AI_LIMITS, type AIAPI, type AIMode } from '../../../../shared/ai'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { FieldSelect } from '../FieldSelect'
import { AISettingsForm } from './AISettingsForm'
import { AIPreview } from './AIPreview'
import { useAIController } from './useAIController'
import { useEditor } from '../../state/editor'

export interface AIAssistantProps {
  onAddSheet: (document: MindMapDocument) => boolean
  api?: AIAPI
  defaultOpen?: boolean
}
export function AIAssistant({
  onAddSheet,
  api = window.trelyx,
  defaultOpen = false,
}: AIAssistantProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [configure, setConfigure] = useState(false)
  const [mode, setMode] = useState<AIMode>('generate')
  const [prompt, setPrompt] = useState('')
  const [includeContext, setIncludeContext] = useState(false)
  const [includeNotes, setIncludeNotes] = useState(false)
  const controller = useAIController(api, onAddSheet)
  const { load } = controller
  useEffect(() => {
    if (defaultOpen) void load()
  }, [defaultOpen, load])
  const targetTitle = useEditor(
    (state) => state.history.document.topics[state.selectedId]?.title ?? '',
  )
  const ready =
    !!controller.settings?.model &&
    (controller.settings.hasKey || controller.settings.baseURL.startsWith('http://'))
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (controller.busy) return
        setOpen(next)
        if (next) void controller.load()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Sparkles className="size-4" />
          AI 助手
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (controller.busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (controller.busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>AI 思维导图助手</DialogTitle>
          <DialogDescription>
            使用你配置的服务与密钥。仅点击生成后联网；结果先预览，再添加到文档。
          </DialogDescription>
        </DialogHeader>
        {!api ? (
          <p role="status" className="rounded-lg bg-muted p-4 text-sm">
            AI 助手需要 Trelyx 桌面版。浏览器预览不会连接 AI 服务或生成模拟结果。
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 break-all text-xs text-muted-foreground">
                {controller.settings
                  ? `${controller.settings.baseURL} · ${controller.settings.model || '尚未配置模型'}`
                  : controller.loading
                    ? '正在读取本地设置…'
                    : '尚未读取服务设置'}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={controller.busy}
                onClick={() => {
                  setConfigure(!configure)
                  if (!controller.settings) void controller.load()
                }}
              >
                服务设置
              </Button>
            </div>
            {configure && !controller.loading && (
              <AISettingsForm
                key={controller.settings?.baseURL ?? 'empty'}
                api={api}
                settings={controller.settings}
                onSave={(settings) => {
                  controller.setSettings(settings)
                  setConfigure(false)
                  controller.setError('')
                }}
              />
            )}
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void controller.generate(mode, prompt, includeContext, includeNotes)
              }}
            >
              <p className="truncate text-xs text-muted-foreground">当前选定主题：{targetTitle}</p>
              <FieldSelect
                label="AI 操作模式"
                value={mode}
                options={[
                  { value: 'generate', label: '生成新画布' },
                  { value: 'expand', label: '扩写为新分支' },
                  { value: 'organize', label: '整理为分支副本' },
                ]}
                onChange={(value) => {
                  setMode(value)
                  controller.setPreview(null)
                }}
              />
              <p className="text-xs text-muted-foreground">
                {mode === 'generate'
                  ? '生成结果添加为新画布，可一次撤销。'
                  : mode === 'expand'
                    ? '生成结果添加到生成开始时选定的主题下，可一次撤销。'
                    : '根据所选内容生成整理建议，添加为副本分支。原主题、图片、备注和附件均保留。'}
              </p>
              {mode === 'organize' && !includeContext && (
                <p className="text-xs text-muted-foreground">
                  整理分支前，请勾选要发送的分支标题。
                </p>
              )}
              <Label className="grid gap-2">
                你的要求
                <Textarea
                  value={prompt}
                  rows={4}
                  maxLength={AI_LIMITS.prompt}
                  disabled={controller.busy}
                  onChange={(event) => {
                    setPrompt(event.target.value)
                    controller.setPreview(null)
                  }}
                  placeholder="例如：为这次产品发布整理准备计划"
                  required
                />
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={includeContext}
                  disabled={controller.busy}
                  onCheckedChange={(value) => {
                    setIncludeContext(value === true)
                    controller.setPreview(null)
                  }}
                />
                发送当前选定分支的主题标题
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={includeContext && includeNotes}
                  disabled={controller.busy || !includeContext}
                  onCheckedChange={(value) => {
                    setIncludeNotes(value === true)
                    controller.setPreview(null)
                  }}
                />
                同时发送该分支的纯文本备注
              </Label>
              <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                生成时会把提示及勾选的分支文字发送到上方服务，服务可能收费；不发送图片、附件或音频。每次最多
                200 个主题、8 层、4096 输出 token，30 秒超时。
              </p>
              <DialogFooter>
                {controller.busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void controller.cancel()
                    }}
                  >
                    取消生成
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      !ready ||
                      controller.loading ||
                      !prompt.trim() ||
                      (mode === 'organize' && !includeContext)
                    }
                  >
                    发送并生成
                  </Button>
                )}
              </DialogFooter>
            </form>
            {controller.preview && (
              <section
                className="grid gap-3 rounded-lg border border-border p-4"
                aria-label="生成结果"
              >
                <p className="text-sm">
                  预览：{controller.preview.result.topicCount} 个主题；用量{' '}
                  {controller.preview.result.inputTokens ?? '未知'} 输入 /{' '}
                  {controller.preview.result.outputTokens ?? '未知'} 输出 token。
                </p>
                <div className="max-h-72 overflow-auto">
                  <AIPreview tree={controller.preview.result.tree} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      controller.setPreview(null)
                    }}
                  >
                    丢弃结果
                  </Button>
                  <Button onClick={controller.apply}>
                    确认添加{controller.preview.mode === 'generate' ? '新画布' : '新分支'}
                  </Button>
                </div>
              </section>
            )}
            {controller.error && (
              <p role="alert" className="text-sm text-destructive">
                {controller.error}
              </p>
            )}
            {controller.status && (
              <p role="status" className="text-sm">
                {controller.status}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
