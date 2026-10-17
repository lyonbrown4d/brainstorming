import { lazy, Suspense, useState } from 'react'
import { AudioLines, Sigma } from 'lucide-react'
import type { TopicMetadata } from '@core'
import { useEditor } from '@renderer/state/editor'
import { importTopicAssets } from '@renderer/state/assets'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { AudioRecorder } from '@renderer/components/metadata/AudioRecorder'
import { setMetadataField } from '@renderer/components/metadata/commands'

const FormulaPreview = lazy(() => import('@renderer/components/metadata/FormulaPreview'))
export const FormulaAudioPanel = ({
  topicId,
  metadata,
}: {
  topicId: string
  metadata: TopicMetadata
}) => {
  const [equation, setEquation] = useState(metadata.equation ?? '')
  const asset = useEditor((state) =>
    metadata.audioAssetId ? state.history.document.assets?.[metadata.audioAssetId] : undefined,
  )
  const busy = useEditor((state) => state.busy)
  return (
    <>
      <section className="space-y-3 border-t border-border py-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Sigma className="size-4" />
          公式
        </h3>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            setMetadataField(topicId, 'equation', equation.trim() || undefined)
          }}
        >
          <Textarea
            aria-label="LaTeX 公式"
            placeholder="E = mc^2"
            value={equation}
            maxLength={10000}
            onChange={(event) => {
              setEquation(event.target.value)
            }}
          />
          <Button type="submit" size="sm">
            保存公式
          </Button>
        </form>
        {metadata.equation && (
          <Suspense fallback={<p className="text-xs text-muted-foreground">正在载入公式…</p>}>
            <FormulaPreview source={metadata.equation} />
          </Suspense>
        )}
      </section>
      <section className="space-y-3 border-t border-border py-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <AudioLines className="size-4" />
          音频
        </h3>
        {asset && (
          <div className="space-y-2">
            <p className="truncate text-xs" title={asset.name}>
              {asset.name}
            </p>
            {/* User-provided local audio has no transcript; do not fabricate a captions track. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              controls
              preload="none"
              className="h-10 w-full"
              aria-label={`播放音频 ${asset.name}`}
              src={`data:${asset.mimeType};base64,${asset.data}`}
            />
          </div>
        )}
        <AudioRecorder topicId={topicId} />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              void importTopicAssets(topicId, 'audio')
            }}
          >
            {asset ? '替换音频' : '添加音频'}
          </Button>
          {metadata.audioAssetId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setMetadataField(topicId, 'audioAssetId', undefined)
              }}
            >
              移除音频
            </Button>
          )}
        </div>
      </section>
    </>
  )
}
