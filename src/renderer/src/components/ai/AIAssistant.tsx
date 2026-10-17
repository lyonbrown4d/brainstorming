import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { MindMapDocument } from '@core'
import { AI_LIMITS, type AIAPI, type AIMode } from '@shared/ai'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { AISettingsForm } from '@renderer/components/ai/AISettingsForm'
import { AIPreview } from '@renderer/components/ai/AIPreview'
import { useAIController } from '@renderer/components/ai/useAIController'
import { useEditor } from '@renderer/state/editor'

export interface AIAssistantProps {
  onAddSheet: (document: MindMapDocument) => boolean
  api?: AIAPI
  defaultOpen?: boolean
}
export const AIAssistant = ({
  onAddSheet,
  api = window.brainstorming,
  defaultOpen = false,
}: AIAssistantProps) => {
  const { translate } = useMessages()

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
          {translate('aiAssistant')}
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
          <DialogTitle>{translate('aiMindMapAssistant')}</DialogTitle>
          <DialogDescription>{translate('usesYourConfiguredServiceAndKeySends')}</DialogDescription>
        </DialogHeader>
        {!api ? (
          <p role="status" className="rounded-lg bg-muted p-4 text-sm">
            {translate('theAiAssistantRequiresTheBrainstormingDesktop')}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 break-all text-xs text-muted-foreground">
                {controller.settings
                  ? `${controller.settings.baseURL} · ${controller.settings.model || translate('noModelConfigured')}`
                  : controller.loading
                    ? translate('loadingLocalSettings')
                    : translate('serviceSettingsNotLoaded')}
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
                {translate('serviceSettings')}
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
              <p className="truncate text-xs text-muted-foreground">
                {translate('selectedTopic')}
                {targetTitle}
              </p>
              <FieldSelect
                label={translate('aiMode')}
                value={mode}
                options={[
                  { value: 'generate', label: translate('generateNewSheet') },
                  { value: 'expand', label: translate('expandAsNewBranch') },
                  { value: 'organize', label: translate('organizeAsBranchCopy') },
                ]}
                onChange={(value) => {
                  setMode(value)
                  controller.setPreview(null)
                }}
              />
              <p className="text-xs text-muted-foreground">
                {mode === 'generate'
                  ? translate('addsResultsAsANewSheetWith')
                  : mode === 'expand'
                    ? translate('addsResultsBelowTheTopicSelectedWhen')
                    : translate('organizesSelectedContentAsACopyOriginal')}
              </p>
              {mode === 'organize' && !includeContext && (
                <p className="text-xs text-muted-foreground">
                  {translate('selectBranchTitlesToSendBeforeOrganizing')}
                </p>
              )}
              <Label className="grid gap-2">
                {translate('yourRequest')}
                <Textarea
                  value={prompt}
                  rows={4}
                  maxLength={AI_LIMITS.prompt}
                  disabled={controller.busy}
                  onChange={(event) => {
                    setPrompt(event.target.value)
                    controller.setPreview(null)
                  }}
                  placeholder={translate('forExampleCreateAPreparationPlanFor')}
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
                {translate('sendTopicTitlesInTheSelectedBranch')}
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
                {translate('alsoSendPlaintextNotesInThisBranch')}
              </Label>
              <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                {translate('generationSendsYourRequestAndSelectedBranch')}
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
                    {translate('cancelGeneration')}
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
                    {translate('sendAndGenerate')}
                  </Button>
                )}
              </DialogFooter>
            </form>
            {controller.preview && (
              <section
                className="grid gap-3 rounded-lg border border-border p-4"
                aria-label={translate('generatedResults')}
              >
                <p className="text-sm">
                  {translate('previewLabel395')}
                  {controller.preview.result.topicCount}
                  {translate('topicsUsage')}{' '}
                  {controller.preview.result.inputTokens ?? translate('unknown')}
                  {translate('input')}{' '}
                  {controller.preview.result.outputTokens ?? translate('unknown')}
                  {translate('outputTokens')}
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
                    {translate('discardResults')}
                  </Button>
                  <Button onClick={controller.apply}>
                    {translate('confirmAddition')}
                    {controller.preview.mode === 'generate'
                      ? translate('newSheetLabel402')
                      : translate('newBranch')}
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
