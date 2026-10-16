/* eslint react/no-unknown-property: "off" -- React Three Fiber uses Three.js JSX properties. */
import { Color } from 'three'
import { Billboard, Html, RoundedBox } from '@react-three/drei'
import { ChevronLeft, ChevronRight, FileText, Focus, Paperclip } from 'lucide-react'
import { memo, type RefObject } from 'react'
import type { DocumentAsset, Topic } from '@core'
import type { SpatialNode } from '../../../../layout/spatial'
import { Button } from '../ui/button'
import { useEditor } from '../../state/editor'
import { interactAnnotationTopic } from '../../state/annotationInteraction'
import { selectTopic } from '../../state/selection'
import { TopicMetadataBadges } from '../metadata/TopicMetadataBadges'
import { SpatialTopicLabel } from './SpatialTopicLabel'
import { usePresentation } from '../../state/presentation'

interface SpatialTopicProps {
  readonly node: SpatialNode
  readonly topic: Topic
  readonly labelPortal: RefObject<HTMLDivElement>
  readonly root: boolean
  readonly detailed: boolean
  readonly selected: boolean
  readonly dropTarget: boolean
  readonly muted: boolean
  readonly fill: string
  readonly branchColor: string
  readonly textColor: string
  readonly fontFamily: string
  readonly imageAsset: DocumentAsset | undefined
  readonly onSelect: (id: string) => void
  readonly onFocus: (id: string) => void
  readonly onCollapse: (id: string) => void
}

export const SpatialTopic = memo(function SpatialTopic({
  node,
  topic,
  labelPortal,
  root,
  detailed,
  selected,
  dropTarget,
  muted,
  fill,
  branchColor,
  textColor,
  fontFamily,
  imageAsset,
  onSelect,
  onFocus,
  onCollapse,
}: SpatialTopicProps) {
  const cardFill =
    node.depth > 1 && !topic.style?.fill
      ? new Color(branchColor).lerp(new Color(fill), 0.82).getStyle()
      : fill
  const width = node.width
  const height = node.height
  const hasImage = Boolean(
    topic.image &&
    imageAsset &&
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(imageAsset.mimeType),
  )
  const content =
    Boolean(topic.notes) || Boolean(topic.attachments?.length) || Boolean(topic.metadata)
  const radius = topic.style?.shape === 'rectangle' ? 0.012 : Math.min(height * 0.2, 0.065)
  const labelColor = textColor
  return (
    <Billboard position={[...node.position]} follow>
      <group rotation={[0.025, -0.09, 0]}>
        {(selected || dropTarget) && (
          <RoundedBox
            args={[width + 0.065, height + 0.065, 0.17]}
            position={[0, 0, -0.03]}
            radius={Math.min(0.08, radius + 0.015)}
            smoothness={2}
            bevelSegments={2}
          >
            <meshBasicMaterial
              color={dropTarget ? '#72a98d' : '#8b78ee'}
              transparent
              opacity={muted ? 0.25 : 0.9}
            />
          </RoundedBox>
        )}
        <RoundedBox
          args={[width, height, 0.16]}
          radius={radius}
          smoothness={detailed ? 2 : 1}
          bevelSegments={detailed ? 2 : 1}
          castShadow={detailed}
          receiveShadow={detailed}
          userData={{ spatialTopicId: topic.id }}
          onClick={(event) => {
            if (usePresentation.getState().playing) return
            event.stopPropagation()
            if (interactAnnotationTopic(topic.id)) return
            if (event.metaKey || event.ctrlKey || event.shiftKey) selectTopic(topic.id, true)
            else onSelect(topic.id)
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            useEditor
              .getState()
              .startEdit(
                topic.id,
                undefined,
                'spatial',
                topic.title === '新主题' || topic.title === '游离主题' ? 'all' : 'end',
              )
          }}
        >
          <meshBasicMaterial
            color={cardFill}
            toneMapped={false}
            transparent={muted}
            opacity={muted ? 0.28 : 1}
          />
        </RoundedBox>
        {!root && detailed && (
          <RoundedBox
            args={[0.035, Math.max(0.12, height - 0.17), 0.03]}
            position={[-width / 2 + 0.045, 0, 0.087]}
            radius={0.012}
            smoothness={1}
          >
            <meshBasicMaterial color={branchColor} transparent opacity={muted ? 0.2 : 0.65} />
          </RoundedBox>
        )}
        <Html
          portal={labelPortal}
          transform
          distanceFactor={4}
          position={[0, 0, 0.099]}
          zIndexRange={[15, 1]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            role="presentation"
            data-spatial-card-id={topic.id}
            data-drop-target={dropTarget || undefined}
            className={`pointer-events-auto relative flex flex-col items-center justify-center gap-1 rounded-md px-4 py-2 ${dropTarget ? 'outline-2 outline-offset-4 outline-dashed outline-[#72a98d]' : ''}`}
            style={{
              width: width * 100,
              height: height * 100,
              opacity: muted ? 0.34 : 1,
              color: labelColor,
              fontFamily,
            }}
            onClick={(event) => {
              if (usePresentation.getState().playing) return
              event.stopPropagation()
              if (interactAnnotationTopic(topic.id)) return
              if (event.metaKey || event.ctrlKey || event.shiftKey) selectTopic(topic.id, true)
              else onSelect(topic.id)
              event.currentTarget
                .querySelector<HTMLButtonElement>('[data-spatial-topic-id]')
                ?.focus({ preventScroll: true })
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              useEditor
                .getState()
                .startEdit(
                  topic.id,
                  undefined,
                  'spatial',
                  topic.title === '新主题' || topic.title === '游离主题' ? 'all' : 'end',
                )
            }}
          >
            {hasImage && imageAsset && (
              <img
                src={`data:${imageAsset.mimeType};base64,${imageAsset.data}`}
                alt={imageAsset.name}
                className="max-h-[110px] max-w-full rounded-md object-contain"
                style={{ maxHeight: Math.max(28, height * 100 - 60) }}
                draggable={false}
              />
            )}
            <SpatialTopicLabel
              topic={topic}
              root={root}
              depth={node.depth}
              selected={selected}
              maxHeight={hasImage ? 44 : Math.max(28, height * 100 - (content ? 36 : 20))}
              color={labelColor}
              onSelect={onSelect}
            />
            <TopicMetadataBadges metadata={topic.metadata} />
            {selected && (
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="pointer-events-auto absolute -top-3 right-1 size-6 rounded-full border-border/70 bg-background text-muted-foreground shadow-sm"
                aria-label={`聚焦主题 ${topic.title}`}
                title="聚焦此主题分支"
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onFocus(topic.id)
                }}
              >
                <Focus className="size-3" />
              </Button>
            )}
            {content && (
              <span className="flex h-4 items-center justify-center gap-2 opacity-65">
                {topic.notes && <FileText className="size-3" aria-label="含备注" />}
                {Boolean(topic.attachments?.length) && (
                  <span className="flex items-center gap-0.5 text-[10px]">
                    <Paperclip className="size-3" />
                    {topic.attachments?.length}
                  </span>
                )}
              </span>
            )}
            {topic.children.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className={`pointer-events-auto absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-border/70 bg-background text-muted-foreground shadow-sm ${topic.side === 'left' && !root ? '-left-2.5' : '-right-2.5'}`}
                aria-label={`${topic.collapsed ? '展开' : '折叠'} ${topic.title}`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onCollapse(topic.id)
                }}
              >
                {topic.collapsed ? (
                  topic.children.length
                ) : topic.side === 'left' && !root ? (
                  <ChevronLeft />
                ) : (
                  <ChevronRight />
                )}
              </Button>
            )}
          </div>
        </Html>
      </group>
    </Billboard>
  )
})
