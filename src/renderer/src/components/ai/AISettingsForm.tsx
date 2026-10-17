import { useId, useRef, useState } from 'react'
import type { AIAPI, AISettings } from '@shared/ai'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

export const AISettingsForm = ({
  api,
  settings,
  onSave,
}: {
  api: AIAPI
  settings: AISettings | null
  onSave: (value: AISettings) => void
}) => {
  const [baseURL, setBaseURL] = useState(settings?.baseURL ?? 'https://api.openai.com/v1')
  const [model, setModel] = useState(settings?.model ?? '')
  const [key, setKey] = useState('')
  const [remember, setRemember] = useState(settings?.rememberKey ?? true)
  const [structured, setStructured] = useState(settings?.structuredOutputs ?? true)
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const composing = useRef(false)
  const id = useId()
  return (
    <form
      className="grid gap-3 rounded-lg border border-border p-4"
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (locked.current || composing.current) return
        locked.current = true
        setBusy(true)
        setError('')
        void api
          .saveAISettings({
            baseURL,
            model,
            rememberKey: remember,
            structuredOutputs: structured,
            clearKey,
            ...(key ? { apiKey: key } : {}),
          })
          .then((value) => {
            onSave(value)
            setClearKey(false)
          })
          .catch(() => {
            setError('保存失败，请检查地址、模型、密钥格式及本地目录权限')
          })
          .finally(() => {
            setKey('')
            locked.current = false
            setBusy(false)
          })
      }}
    >
      <Label className="grid gap-2" htmlFor={`${id}-url`}>
        OpenAI 兼容服务地址
        <Input
          id={`${id}-url`}
          value={baseURL}
          onChange={(event) => {
            setBaseURL(event.target.value)
          }}
          placeholder="https://api.example.com/v1"
          required
          disabled={busy}
        />
      </Label>
      <p className="text-xs text-muted-foreground">
        支持 HTTPS；Ollama 等本机服务可用 http://localhost:11434/v1。更换服务地址会清除旧密钥。
      </p>
      <Label className="grid gap-2" htmlFor={`${id}-model`}>
        模型名称
        <Input
          id={`${id}-model`}
          value={model}
          maxLength={120}
          onChange={(event) => {
            setModel(event.target.value)
          }}
          placeholder="服务提供的模型 ID"
          required
          disabled={busy}
        />
      </Label>
      <Label className="grid gap-2" htmlFor={`${id}-key`}>
        API 密钥
        <Input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          value={key}
          maxLength={4096}
          onChange={(event) => {
            setKey(event.target.value)
          }}
          placeholder={settings?.hasKey ? '已设置，留空保留' : '本机服务可以留空'}
          disabled={busy}
        />
      </Label>
      <Label className="flex items-center gap-2">
        <Checkbox
          checked={remember}
          onCheckedChange={(value) => {
            setRemember(value === true)
          }}
          disabled={busy}
        />
        安全存储可用时记住密钥
      </Label>
      <Label className="flex items-center gap-2">
        <Checkbox
          checked={structured}
          onCheckedChange={(value) => {
            setStructured(value === true)
          }}
          disabled={busy}
        />
        服务支持 JSON Schema 结构化输出
      </Label>
      <Label className="flex items-center gap-2">
        <Checkbox
          checked={clearKey}
          onCheckedChange={(value) => {
            setClearKey(value === true)
          }}
          disabled={busy}
        />
        清除现有密钥
      </Label>
      {settings?.notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {settings.notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={busy || !model.trim()}>
        {busy ? '正在保存…' : '保存服务设置'}
      </Button>
    </form>
  )
}
