import { useCallback, useEffect, useRef, useState } from 'react'
import type { MindMapDocument } from '@core'
import {
  assertAITree,
  type AIAPI,
  type AIMode,
  type AIResult,
  type AISettings,
} from '../../../../shared/ai'
import { aiContext, applyAIResult, captureAISnapshot, type AISnapshot } from './apply'

export interface AIPreview {
  readonly result: AIResult
  readonly snapshot: AISnapshot
  readonly mode: AIMode
}
export function useAIController(
  api: AIAPI | undefined,
  onAddSheet: (document: MindMapDocument) => boolean,
) {
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
      setError('无法读取 AI 设置，请重新保存配置')
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
        setError(cause instanceof Error ? cause.message : 'AI 生成失败，请检查服务配置')
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
    setStatus('正在取消 AI 请求…')
    try {
      await api.cancelAIGeneration(id)
      setStatus('已取消 AI 请求；已提交的服务请求可能仍计费')
    } catch {
      setError('无法确认服务端取消状态；结果不会应用到文档')
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
          preview.mode === 'generate' ? '已添加 AI 画布，可撤销' : '已添加生成分支，可一次撤销',
        )
      } else setError('无法添加生成结果，请完成当前编辑后重试')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法应用生成结果')
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
