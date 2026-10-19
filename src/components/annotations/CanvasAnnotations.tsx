import { useMessages } from '@renderer/i18n/useMessages'

import { ViewportPortal } from '@xyflow/react'
import type { MindMapDocument } from '@core'
import type { LayoutNode } from '@layout'
import { InlineAnnotationLabel } from '@renderer/components/annotations/InlineAnnotationLabel'
import { groupBounds } from '@renderer/components/annotations/projection'
import { SummaryBracket } from '@renderer/components/annotations/SummaryBracket'

export const CanvasAnnotations = ({
  document,
  nodes,
}: {
  document: MindMapDocument
  nodes: readonly LayoutNode[]
}) => {
  const { translate } = useMessages()

  const byId = new Map(nodes.map((node) => [node.id, node]))
  return (
    <ViewportPortal>
      <div
        className="pointer-events-none absolute inset-0"
        aria-label={translate('canvasAnnotations')}
      >
        {(document.groups ?? []).map((group) => {
          if (group.kind === 'summary')
            return <SummaryBracket key={group.id} document={document} group={group} nodes={nodes} />
          const bounds = groupBounds(
            group.topicIds.flatMap((id) => {
              const node = byId.get(id)
              return node ? [node] : []
            }),
          )
          if (!bounds) return null
          return (
            <div
              key={group.id}
              className="absolute rounded-xl border-2 border-dashed"
              style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                borderColor: group.color ?? '#8b79d9',
                backgroundColor: `${group.color ?? '#8b79d9'}0a`,
              }}
            >
              <div className="absolute -top-5 left-2">
                <InlineAnnotationLabel
                  kind="group"
                  id={group.id}
                  text={group.title?.trim() ? group.title : translate('boundary')}
                  color={group.color}
                />
              </div>
            </div>
          )
        })}
        {(document.callouts ?? []).map((callout) => {
          const node = byId.get(callout.topicId)
          return node ? (
            <div
              key={callout.id}
              className="absolute max-w-48 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs whitespace-pre-wrap text-amber-950 shadow-sm"
              style={{ left: node.x + node.width + 14, top: node.y - 16 }}
            >
              <InlineAnnotationLabel kind="callout" id={callout.id} text={callout.text} />
            </div>
          ) : null
        })}
      </div>
    </ViewportPortal>
  )
}
