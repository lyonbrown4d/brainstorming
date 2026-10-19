import { useTopicPropertyFocusTarget } from '@renderer/hooks/useTopicPropertyFocus'
import { LinkPreviewAction } from '@renderer/components/metadata/LinkPreviewAction'
import { useMessages } from '@renderer/i18n/useMessages'
import { translate } from '@renderer/i18n'
import { useState } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import type { TopicMetadata, TopicLink } from '@core'
import { getParentId } from '@core'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { setMetadataField } from '@renderer/components/metadata/commands'
import { requireDesktopAPI } from '@renderer/lib/desktop'

export const openTopicLink = (link: TopicLink): void => {
  const state = useEditor.getState()
  if (link.kind === 'url') {
    try {
      if (!['https:', 'http:', 'mailto:'].includes(new URL(link.url).protocol))
        throw new Error(translate('unsupportedLinkProtocol'))
    } catch {
      state.setError(translate('invalidOrUnsupportedLink'))
      return
    }
    void Promise.resolve()
      .then(() => requireDesktopAPI().openExternal(link.url))
      .catch((error: unknown) => {
        state.setError(error instanceof Error ? error.message : translate('couldNotOpenLink'))
      })
    return
  }
  const sheetId = link.sheetId ?? state.activeSheetId
  state.switchSheet(sheetId)
  const current = useEditor.getState()
  if (current.activeSheetId !== sheetId || !current.history.document.topics[link.topicId]) {
    current.setError(translate('linkedTopicDoesNotExist'))
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
}
export const LinkPanel = ({ topicId, metadata }: { topicId: string; metadata: TopicMetadata }) => {
  const focusRef = useTopicPropertyFocusTarget(topicId, 'link')
  const { translate } = useMessages()

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
  ).map((topic) => ({ value: topic.id, label: topic.title || translate('untitledTopic') }))
  return (
    <section ref={focusRef} className="space-y-3 border-t border-border py-4">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="size-4" />
        {translate('hyperlink')}
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
          label={translate('linkType')}
          value={kind}
          options={[
            { value: 'url', label: translate('websiteOrEmail') },
            { value: 'topic', label: translate('internalTopic') },
          ]}
          onChange={setKind}
        />
        {kind === 'url' ? (
          <Input
            aria-label={translate('linkUrl')}
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
              label={translate('targetSheet')}
              value={sheetId}
              options={workbook.sheets.map((sheet) => ({ value: sheet.id, label: sheet.name }))}
              onChange={(value) => {
                setSheetId(value)
                setTargetId('')
              }}
            />
            <FieldSelect
              label={translate('targetTopic')}
              value={targetId}
              options={targets}
              onChange={setTargetId}
            />
          </>
        )}
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={kind === 'url' ? !url.trim() : !targetId}>
            {translate('saveLink')}
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
                {translate('open')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setMetadataField(topicId, 'link', undefined)
                }}
              >
                {translate('remove')}
              </Button>
            </>
          )}
        </div>
      </form>
      {metadata.link?.kind === 'url' && (
        <LinkPreviewAction key={metadata.link.url} topicId={topicId} url={metadata.link.url} />
      )}
    </section>
  )
}
