import { useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, FolderOpen, Sparkles } from 'lucide-react'
import type { LayoutKind } from '@core'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { StructurePreview } from '../documents/StructurePreview'
import { structureOptions } from '../documents/structureOptions'
import { templateOptions } from '../documents/templates'
import { StructureChoices } from './StructureChoices'
import { TemplateChoices } from './TemplateChoices'
import { isCompositionKey } from '../../state/keyboard'
import type { CreationGalleryProps, CreationRequest } from './types'
export type { CreationGalleryProps, CreationRequest } from './types'

export function CreationGallery({
  mode,
  onCreate,
  onCancel,
  cancelLabel = '返回画布',
  onOpen,
  onExample,
  busy = false,
  error,
}: CreationGalleryProps) {
  const nameId = useId()
  const [title, setTitle] = useState('')
  const [layout, setLayout] = useState<LayoutKind>('map')
  const [template, setTemplate] = useState<CreationRequest['template']>('blank')
  const [accepted, setAccepted] = useState(false)
  const submitting = useRef(false)
  const noun = mode === 'document' ? '文档' : '画布'
  const disabled = busy || accepted
  const selectedLabel = structureOptions.find((option) => option.value === layout)?.label ?? layout
  const templateLabel =
    template === 'blank'
      ? '空白导图'
      : templateOptions.find((option) => option.id === template)?.title
  const resolvedTitle =
    title.trim() ||
    (template === 'blank'
      ? mode === 'document'
        ? '新的想法'
        : '新画布'
      : (templateLabel ?? '新的想法'))
  return (
    <section
      aria-label={`新建${noun}`}
      className="h-full min-h-0 overflow-y-auto bg-muted/25 text-foreground"
    >
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onCancel && (
              <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>
                <ArrowLeft className="size-4" />
                {cancelLabel}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {onExample && (
              <Button type="button" variant="ghost" disabled={disabled} onClick={onExample}>
                <Sparkles className="size-4" />
                探索示例
              </Button>
            )}
            {onOpen && (
              <Button type="button" variant="outline" disabled={disabled} onClick={onOpen}>
                <FolderOpen className="size-4" />
                打开本地文件
              </Button>
            )}
          </div>
        </header>
        <div className="mb-7 max-w-2xl space-y-2">
          <p className="text-xs font-semibold tracking-widest text-primary">
            {mode === 'document' ? '开始一份新的思考' : '在当前文档中继续思考'}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">新建{noun}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {mode === 'document'
              ? '选择适合内容的图形结构，从空白或模板开始。'
              : '每张画布拥有独立的导图内容、图形结构和撤销历史。'}
          </p>
        </div>
        <form
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]"
          onSubmit={(event) => {
            event.preventDefault()
            if (disabled || submitting.current) return
            submitting.current = true
            try {
              if (onCreate({ title, layout, template })) setAccepted(true)
            } finally {
              submitting.current = false
            }
          }}
        >
          <div className="min-w-0 space-y-7">
            <section className="space-y-3" aria-labelledby={`${nameId}-structure`}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 id={`${nameId}-structure`} className="text-base font-semibold">
                  图形结构
                </h2>
                <span className="text-xs text-muted-foreground">创建后仍可切换</span>
              </div>
              <StructureChoices value={layout} onChange={setLayout} disabled={disabled} />
            </section>
            <section className="space-y-3" aria-labelledby={`${nameId}-template`}>
              <h2 id={`${nameId}-template`} className="text-base font-semibold">
                初始内容
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                模板提供可编辑的主题内容，保留上方选择的图形结构。
              </p>
              <TemplateChoices value={template} onChange={setTemplate} disabled={disabled} />
            </section>
          </div>
          <aside
            className="space-y-5 rounded-2xl border border-border bg-background p-5 shadow-xs lg:sticky lg:top-5"
            aria-label="创建预览"
          >
            <div className="rounded-xl bg-primary/5 px-4 py-6 [&_svg]:h-24">
              <StructurePreview kind={layout} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{selectedLabel}</p>
              <p className="text-xs text-muted-foreground">{templateLabel}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={nameId}>{noun}名称</Label>
              <Input
                id={nameId}
                value={title}
                maxLength={80}
                disabled={disabled}
                placeholder={resolvedTitle}
                onChange={(event) => {
                  setTitle(event.target.value)
                }}
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && isCompositionKey(event.nativeEvent))
                    event.preventDefault()
                }}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={disabled} className="w-full">
              {busy ? '正在创建…' : `创建${noun}`}
              <ArrowUpRight className="size-4" />
            </Button>
          </aside>
        </form>
      </div>
    </section>
  )
}
