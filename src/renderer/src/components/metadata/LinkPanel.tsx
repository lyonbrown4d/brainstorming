import { useState } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import type { TopicMetadata, TopicLink } from '@core'
import { getParentId } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useSpatialView } from '@renderer/state/spatial'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { setMetadataField } from '@renderer/components/metadata/commands'

export const openTopicLink = (link: TopicLink): void => {
  const state = useEditor.getState()
  if (link.kind === 'url') {
    try {
      if (!['https:', 'http:', 'mailto:'].includes(new URL(link.url).protocol))
        throw new Error('链接协议不受支持')
    } catch {
      state.setError('链接地址无效或不受支持')
      return
    }
    if (window.trelyx)
      void window.trelyx.openExternal(link.url).catch((error: unknown) => {
        state.setError(error instanceof Error ? error.message : '打开链接失败')
      })
    else window.open(link.url, '_blank', 'noopener,noreferrer')
    return
  }
  const sheetId = link.sheetId ?? state.activeSheetId
  state.switchSheet(sheetId)
  const current = useEditor.getState()
  if (current.activeSheetId !== sheetId || !current.history.document.topics[link.topicId]) {
    current.setError('链接指向的主题不存在')
    return
  }
  const commands = []
  let parent = getParentId(current.history.document, link.topicId)
  while (parent) {
    if (current.history.document.topics[parent]?.collapsed)
      commands.push({ type: 'toggleCollapse' as const, topicId: parent })
    parent = getParentId(current.history.document, parent)
  }
  if (commands.length && !current.command({ type: 'batch', commands })) return
  current.select(link.topicId)
  useSpatialView.getState().setFocus(sheetId, null)
}
export const LinkPanel = ({ topicId, metadata }: { topicId: string; metadata: TopicMetadata }) => {
  const workbook = useEditor((state) => state.workbook)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const [kind, setKind] = useState(metadata.link?.kind ?? 'url')
  const [url, setUrl] = useState(metadata.link?.kind === 'url' ? metadata.link.url : '')
  const [sheetId, setSheetId] = useState(
    metadata.link?.kind === 'topic' ? (metadata.link.sheetId ?? activeSheetId) : activeSheetId,
  )
  const [targetId, setTargetId] = useState(
    metadata.link?.kind === 'topic' ? metadata.link.topicId : '',
  )
  const targets = Object.values(
    workbook.sheets.find((sheet) => sheet.id === sheetId)?.document.topics ?? {},
  ).map((topic) => ({ value: topic.id, label: topic.title || '未命名主题' }))
  return (
    <section className="space-y-3 border-t border-border py-4">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="size-4" />
        超链接
      </h3>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          setMetadataField(
            topicId,
            'link',
            kind === 'url' ? { kind, url } : { kind, topicId: targetId, sheetId },
          )
        }}
      >
        <FieldSelect
          label="链接类型"
          value={kind}
          options={[
            { value: 'url', label: '网页或邮件' },
            { value: 'topic', label: '内部主题' },
          ]}
          onChange={setKind}
        />
        {kind === 'url' ? (
          <Input
            aria-label="链接地址"
            placeholder="https://example.com"
            value={url}
            maxLength={2048}
            onChange={(event) => {
              setUrl(event.target.value)
            }}
          />
        ) : (
          <>
            <FieldSelect
              label="链接目标画布"
              value={sheetId}
              options={workbook.sheets.map((sheet) => ({ value: sheet.id, label: sheet.name }))}
              onChange={(value) => {
                setSheetId(value)
                setTargetId('')
              }}
            />
            <FieldSelect
              label="链接目标主题"
              value={targetId}
              options={targets}
              onChange={setTargetId}
            />
          </>
        )}
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={kind === 'url' ? !url.trim() : !targetId}>
            保存链接
          </Button>
          {metadata.link && (
            <>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  if (metadata.link) openTopicLink(metadata.link)
                }}
              >
                <ExternalLink className="size-3" />
                打开
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setMetadataField(topicId, 'link', undefined)
                }}
              >
                移除
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  )
}
