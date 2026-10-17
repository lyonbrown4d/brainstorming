import { translate } from '@renderer/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MindMapDocument } from '@core'
import { assertAITree, type AIAPI, type AIMode, type AIResult, type AISettings } from '@shared/ai'
import {
  aiContext,
  applyAIResult,
  captureAISnapshot,
  type AISnapshot,
} from '@renderer/components/ai/apply'

export interface AIPreview {
  readonly result: AIResult
  readonly snapshot: AISnapshot
  readonly mode: AIMode
}
export const useAIController = (
  api: AIAPI | undefined,
  onAddSheet: (document: MindMapDocument) => boolean,
) => {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<AIPreview | null>(null)
  const [status, setStatus] = useState('')
  const request = useRef<string | null>(null)
  const loadingSettings = useRef(false)
  const canceling = useRef(false)
  useEffect(
    () => () => {
      const id = request.current
      request.current = null
      if (api && id) void api.cancelAIGeneration(id).catch(() => undefined)
    },
    [api],
  )
  const load = useCallback(async () => {
    if (!api || loadingSettings.current) return
    loadingSettings.current = true
    setLoading(true)
    setError('')
    try {
      setSettings(await api.getAISettings())
    } catch {
      setError(translate('couldNotLoadAiSettingsSaveYour'))
    } finally {
      loadingSettings.current = false
      setLoading(false)
    }
  }, [api])
  const generate = async (
    mode: AIMode,
    prompt: string,
    includeContext: boolean,
    includeNotes: boolean,
  ) => {
    if (!api || request.current || canceling.current) return
    const id = crypto.randomUUID()
    request.current = id
    setBusy(true)
    setPreview(null)
    setError('')
    setStatus('')
    try {
      const snapshot = captureAISnapshot()
      const result = await api.generateMindMap({
        requestId: id,
        mode,
        prompt,
        context: includeContext ? aiContext(snapshot, includeNotes) : [],
      })
      if (request.current !== id) return
      assertAITree(result.tree)
      setPreview({ result, snapshot, mode })
    } catch (cause) {
      if (request.current === id)
        setError(
          cause instanceof Error
            ? cause.message
            : translate('aiGenerationFailedCheckYourServiceSettings'),
        )
    } finally {
      if (request.current === id) {
        request.current = null
        setBusy(false)
      }
    }
  }
  const cancel = async () => {
    const id = request.current
    if (!api || !id) return
    request.current = null
    canceling.current = true
    setStatus(translate('cancellingAiRequest'))
    try {
      await api.cancelAIGeneration(id)
      setStatus(translate('aiRequestCancelledYourProviderMayStill'))
    } catch {
      setError(translate('serverCancellationCouldNotBeConfirmedResults'))
    } finally {
      canceling.current = false
      setBusy(false)
    }
  }
  const apply = () => {
    if (!preview || request.current) return
    try {
      if (applyAIResult(preview.snapshot, preview.result.tree, preview.mode, onAddSheet)) {
        setPreview(null)
        setStatus(
          preview.mode === 'generate'
            ? translate('aiSheetAddedYouCanUndoThis')
            : translate('generatedBranchAddedYouCanUndoThis'),
        )
      } else setError(translate('finishEditingBeforeAddingGeneratedResults'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate('couldNotApplyGeneratedResults'))
    }
  }
  return {
    settings,
    setSettings,
    loading,
    busy,
    error,
    setError,
    preview,
    setPreview,
    status,
    load,
    generate,
    cancel,
    apply,
  }
}
